'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { btn } from '@/components/ui';
import { activateTrial, completeCardUpdate, refreshSubscription, startCardUpdate } from './actions';
import { getStripe, stripeAppearance } from './stripe-elements';

type Card = { brand: string; last4: string; expMonth: number; expYear: number } | null;

const BRAND: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', cartes_bancaires: 'CB' };

/** Carte de l'abonnement et changement de carte (règle aussi un paiement en retard). */
export function CardUpdate({ card, pastDue }: { card: Card; pastDue: boolean }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const stripePromise = useMemo(() => getStripe(), []);
  const appearance = useMemo(() => stripeAppearance(), []);

  async function open() {
    setLoading(true);
    setError(null);
    setMessage(null);
    const res = await startCardUpdate();
    setLoading(false);
    if ('error' in res) setError(res.error);
    else setSecret(res.clientSecret);
  }

  const expired = card ? new Date(card.expYear, card.expMonth) < new Date() : false;

  return (
    <div className="flex flex-col gap-4">
      {card ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-ground px-4 py-3">
          <span className="flex h-8 w-12 items-center justify-center rounded-md bg-surface text-[11px] font-bold uppercase tracking-wide text-muted ring-1 ring-line">{BRAND[card.brand] ?? card.brand}</span>
          <span className="flex-1">
            <span className="block font-semibold tabular-nums">•••• {card.last4}</span>
            <span className={`text-sm ${expired ? 'text-danger' : 'text-muted'}`}>
              {expired ? 'Expirée depuis ' : 'Expire en '}
              {String(card.expMonth).padStart(2, '0')}/{card.expYear}
            </span>
          </span>
        </div>
      ) : (
        <p className="text-muted">Aucune carte enregistrée.</p>
      )}

      {message ? <p role="status" className="rounded-[10px] bg-success-soft px-4 py-3 text-sm text-success">{message}</p> : null}
      {error ? <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}

      {secret && stripePromise ? (
        <Elements stripe={stripePromise} options={{ clientSecret: secret, appearance }}>
          <NewCardForm
            pastDue={pastDue}
            onDone={(msg) => {
              setSecret(null);
              setMessage(msg);
            }}
            onCancel={() => setSecret(null)}
          />
        </Elements>
      ) : (
        <button type="button" onClick={open} disabled={loading} className={pastDue ? btn.primary : btn.secondary}>
          {loading ? <span className="spinner" aria-hidden="true" /> : null}
          {pastDue ? 'Changer de carte et régler le paiement' : card ? 'Changer de carte' : 'Ajouter une carte'}
        </button>
      )}
    </div>
  );
}

function NewCardForm({ pastDue, onDone, onCancel }: { pastDue: boolean; onDone: (message: string) => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: `${window.location.origin}/app/abonnement?retour=carte` },
        redirect: 'if_required',
      });
      if (err) throw new Error(err.message);
      const res = await completeCardUpdate(setupIntent.id);
      if ('error' in res) throw new Error(res.error);
      if (res.actionSecret) {
        const next = await stripe.handleNextAction({ clientSecret: res.actionSecret });
        if (next.error) throw new Error(next.error.message);
      }
      await refreshSubscription().catch(() => null);
      router.refresh();
      onDone(res.actionSecret ? 'Carte enregistrée et paiement validé. Merci !' : res.message);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'La carte n’a pas pu être enregistrée.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="rounded-xl border border-line bg-surface p-4">
        <PaymentElement options={{ layout: 'tabs', terms: { card: 'never' } }} />
      </div>
      {error ? <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!stripe || busy} className={btn.primary}>
          {busy ? <span className="spinner" aria-hidden="true" /> : null}
          {pastDue ? 'Enregistrer et payer' : 'Enregistrer la carte'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={btn.secondary}>
          Annuler
        </button>
      </div>
    </form>
  );
}

/**
 * Retour d'une validation bancaire qui a quitté la page (certaines banques
 * redirigent) : on termine l'opération, puis on nettoie l'adresse.
 */
export function StripeReturn() {
  const params = useSearchParams();
  const router = useRouter();
  const ran = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const retour = params.get('retour');
    if (!retour || ran.current) return;
    ran.current = true;
    const si = params.get('setup_intent');
    const status = params.get('redirect_status');
    (async () => {
      if (status && status !== 'succeeded') {
        setError('La validation bancaire n’a pas abouti. Réessayez ou utilisez une autre carte.');
        router.replace('/app/abonnement');
        return;
      }
      if (retour === 'essai' && si) {
        const res = await activateTrial(si);
        if ('error' in res) return setError(res.error);
      } else if (retour === 'carte' && si) {
        const res = await completeCardUpdate(si);
        if ('error' in res) return setError(res.error);
      } else {
        await refreshSubscription().catch(() => null);
      }
      router.replace(retour === 'carte' ? '/app/abonnement' : '/app/abonnement?statut=merci');
      router.refresh();
    })();
  }, [params, router]);

  return error ? <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null;
}
