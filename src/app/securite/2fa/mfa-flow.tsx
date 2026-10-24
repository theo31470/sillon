'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { btn, inputClass } from '@/components/ui';
import { recordMfaSuccess } from './actions';

type Step =
  | { kind: 'loading' }
  | { kind: 'enroll'; factorId: string; qr: string; secret: string }
  | { kind: 'verify'; factorId: string }
  | { kind: 'error'; message: string };

/**
 * Double authentification par application (Google Authenticator, Authy, 1Password…).
 * Première visite : on affiche un QR code à scanner. Ensuite : on demande le code à 6 chiffres.
 */
export function MfaFlow({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal.data?.currentLevel === 'aal2') {
        router.replace(next);
        return;
      }
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) {
        setStep({ kind: 'error', message: 'Session expirée. Reconnectez-vous.' });
        return;
      }
      const verified = factors.data.totp[0];
      if (verified) {
        setStep({ kind: 'verify', factorId: verified.id });
        return;
      }
      // Nettoie les inscriptions inachevées avant d'en créer une nouvelle.
      for (const f of factors.data.all.filter((f) => f.status === 'unverified')) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const enrolled = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Sillon' });
      if (enrolled.error) {
        setStep({ kind: 'error', message: 'Impossible de préparer la double authentification. Réessayez.' });
        return;
      }
      setStep({ kind: 'enroll', factorId: enrolled.data.id, qr: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret });
    })();
  }, [next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== 'enroll' && step.kind !== 'verify') return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: step.factorId, code: code.trim() });
    if (verifyError) {
      setBusy(false);
      setError('Code incorrect ou expiré. Vérifiez l’heure de votre téléphone et réessayez.');
      return;
    }
    await recordMfaSuccess(step.kind === 'enroll');
    router.replace(next);
    router.refresh();
  }

  if (step.kind === 'loading') return <p className="text-muted">Chargement…</p>;
  if (step.kind === 'error') return <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{step.message}</p>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {step.kind === 'enroll' ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted">
            1. Installez une application d’authentification (Google Authenticator, Authy, 1Password…).<br />
            2. Scannez ce QR code avec l’application.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR code fourni en data URI par Supabase */}
          <img src={step.qr} alt="QR code à scanner avec votre application d’authentification" width={180} height={180} className="self-center rounded-lg border border-line p-2" />
          <details className="text-sm text-muted">
            <summary className="cursor-pointer">Impossible de scanner ?</summary>
            <p className="mt-2">Saisissez cette clé dans l’application : <code className="break-all rounded bg-ground px-1.5 py-0.5 text-ink">{step.secret}</code></p>
          </details>
          <p className="text-muted">3. Saisissez le code à 6 chiffres affiché.</p>
        </div>
      ) : (
        <p className="text-muted">Saisissez le code à 6 chiffres affiché dans votre application d’authentification.</p>
      )}
      <label htmlFor="code" className="text-sm font-semibold">Code de vérification</label>
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        className={`${inputClass} text-center text-2xl font-bold tracking-[0.5em]`}
      />
      {error ? <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
      <button type="submit" disabled={busy || code.length !== 6} className={btn.primary}>
        {busy ? 'Vérification…' : 'Vérifier et continuer'}
      </button>
    </form>
  );
}
