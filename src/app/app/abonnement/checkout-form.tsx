'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { COMPLET_PRICES, TRIAL_DAYS, type BillingPeriod } from '@/lib/plans';
import { Field, Input, btn } from '@/components/ui';
import { activateTrial, refreshSubscription, startSubscription } from './actions';
import { BillingFields, type BillingDefaults } from './billing-fields';
import { getStripe, publishableKey, stripeAppearance } from './stripe-elements';

const AMOUNTS: Record<BillingPeriod, number> = { mensuel: Math.round(COMPLET_PRICES.mensuel.amount * 100), annuel: Math.round(COMPLET_PRICES.annuel.amount * 100) };

/** Souscription à la formule Complet, entièrement dans la page. */
export function CheckoutForm({ trial, annualAvailable, billing, vatMention }: { trial: boolean; annualAvailable: boolean; billing: BillingDefaults; vatMention: string }) {
  const [period, setPeriod] = useState<BillingPeriod>(annualAvailable ? 'annuel' : 'mensuel');
  const stripePromise = useMemo(() => getStripe(), []);
  const appearance = useMemo(() => stripeAppearance(), []);

  if (!publishableKey || !stripePromise) {
    return <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">Le paiement en ligne est momentanément indisponible. Écrivez-nous depuis la page Contact pour souscrire.</p>;
  }
  return (
    <Elements
      stripe={stripePromise}
      options={{
        ...(trial ? { mode: 'setup' as const } : { mode: 'subscription' as const, amount: AMOUNTS[period] }),
        currency: 'eur',
        allowedPaymentMethodTypes: ['card'],
        appearance,
        fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap' }],
      }}
    >
      <Form trial={trial} annualAvailable={annualAvailable} billing={billing} vatMention={vatMention} period={period} setPeriod={setPeriod} />
    </Elements>
  );
}

function Form({
  trial,
  annualAvailable,
  billing,
  vatMention,
  period,
  setPeriod,
}: {
  trial: boolean;
  annualAvailable: boolean;
  billing: BillingDefaults;
  vatMention: string;
  period: BillingPeriod;
  setPeriod: (p: BillingPeriod) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const price = COMPLET_PRICES[period];

  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(t);
  }, [ready]);

  function choose(p: BillingPeriod) {
    setPeriod(p);
    if (!trial) elements?.update({ amount: AMOUNTS[p] });
  }

  async function finish() {
    await refreshSubscription().catch(() => null);
    router.replace('/app/abonnement?statut=merci');
    router.refresh();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !formRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 1. Vérifie la carte saisie (format, date) avant tout appel au serveur.
      const check = await elements.submit();
      if (check.error) throw new Error(check.error.message);

      // 2. Le serveur enregistre la facturation et prépare l'opération.
      const fd = new FormData(formRef.current);
      fd.set('periode', period);
      const res = await startSubscription(fd);
      if ('error' in res) {
        if (res.field) formRef.current.querySelector<HTMLElement>(`[name="${res.field === 'promo' ? 'promo' : `billing_${res.field === 'vat_number' ? 'vat' : res.field}`}"]`)?.focus();
        throw new Error(res.error);
      }
      if (res.kind === 'done') return await finish();

      const returnUrl = `${window.location.origin}/app/abonnement?retour=${res.kind === 'setup' ? 'essai' : 'paiement'}`;
      if (res.kind === 'setup') {
        // 3a. Essai : la carte est enregistrée (validation bancaire si besoin), rien n'est débité.
        const { error: err, setupIntent } = await stripe.confirmSetup({ elements, clientSecret: res.clientSecret, confirmParams: { return_url: returnUrl }, redirect: 'if_required' });
        if (err) throw new Error(err.message);
        const done = await activateTrial(setupIntent.id);
        if ('error' in done) throw new Error(done.error);
        return await finish();
      }
      // 3b. Premier paiement (validation bancaire 3-D Secure si la banque la demande).
      const { error: err } = await stripe.confirmPayment({ elements, clientSecret: res.clientSecret, confirmParams: { return_url: returnUrl }, redirect: 'if_required' });
      if (err) throw new Error(err.message);
      return await finish();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Le paiement n’a pas abouti. Réessayez.');
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-6" noValidate={false}>
      {/* Formule */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-lg font-semibold">1. Votre formule</legend>
        <div className={`grid gap-3 ${annualAvailable ? 'sm:grid-cols-2' : ''}`}>
          {(annualAvailable ? (['annuel', 'mensuel'] as const) : (['mensuel'] as const)).map((p) => {
            const active = period === p;
            const info = COMPLET_PRICES[p];
            return (
              <label
                key={p}
                className={`relative flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-4 transition-colors ${active ? 'border-brand bg-brand-tint' : 'border-line bg-surface hover:border-field'}`}
              >
                <input type="radio" name="periode_choice" value={p} checked={active} onChange={() => choose(p)} className="sr-only" />
                <span className="flex items-center justify-between gap-2 font-semibold">
                  {p === 'annuel' ? 'Annuel' : 'Mensuel'}
                  {p === 'annuel' ? <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-bold text-success">{COMPLET_PRICES.annuel.saving}</span> : null}
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {info.label} <span className="text-base font-normal text-muted">{info.period}</span>
                </span>
                {p === 'annuel' ? <span className="text-sm text-muted">soit {COMPLET_PRICES.annuel.perMonth} par mois</span> : <span className="text-sm text-muted">sans engagement</span>}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Facturation */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-lg font-semibold">2. Informations de facturation</legend>
        <BillingFields defaults={billing} idPrefix="co" />
      </fieldset>

      {/* Paiement */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">3. Carte bancaire</legend>
        {trial ? <p className="text-sm text-muted">Rien n’est débité aujourd’hui : la carte servira à la fin des {TRIAL_DAYS} jours d’essai, sauf si vous résiliez avant.</p> : null}
        <div className="min-h-[120px] rounded-xl border border-line bg-surface p-4">
          {!ready ? (
            <p className="text-sm text-muted">
              {slow
                ? 'Le formulaire de paiement ne se charge pas : vérifiez votre connexion ou désactivez un éventuel bloqueur de publicités, puis rechargez la page.'
                : 'Chargement du formulaire sécurisé…'}
            </p>
          ) : null}
          <PaymentElement onReady={() => setReady(true)} options={{ layout: 'tabs', terms: { card: 'never' }, wallets: { applePay: 'auto', googlePay: 'auto' } }} />
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-brand">J’ai un code promotionnel</summary>
          <div className="mt-2 max-w-xs">
            <Field label="Code promotionnel" htmlFor="co-promo">
              <Input id="co-promo" name="promo" maxLength={40} autoComplete="off" className="uppercase" />
            </Field>
          </div>
        </details>
      </fieldset>

      {error ? (
        <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl bg-ground p-4">
        <p className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">{trial ? 'À payer aujourd’hui' : 'Total'}</span>
          <span className="text-xl font-bold tabular-nums">{trial ? '0,00 €' : price.label}</span>
        </p>
        {trial ? (
          <p className="text-sm text-muted">
            Puis {price.label} {price.period} à la fin de l’essai. Résiliable en un clic depuis cette page.
          </p>
        ) : null}
        <button type="submit" disabled={!stripe || !ready || busy} className={`${btn.primary} w-full`}>
          {busy ? (
            <>
              <span className="spinner" aria-hidden="true" /> Validation…
            </>
          ) : trial ? (
            `Démarrer mes ${TRIAL_DAYS} jours d’essai gratuit`
          ) : (
            `Payer ${price.label} et activer`
          )}
        </button>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          Paiement chiffré par Stripe · Vos numéros de carte ne passent jamais par nos serveurs · Prix TTC, {vatMention}
        </p>
      </div>
    </form>
  );
}
