'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { COMPLET_PRICES, TRIAL_DAYS, type BillingPeriod } from '@/lib/plans';
import { Input, btn } from '@/components/ui';
import { activateTrial, checkPromo, refreshSubscription, startSubscription, type PromoPreview } from './actions';
import { BillingFields, type BillingDefaults } from './billing-fields';
import { getStripe, publishableKey, stripeAppearance } from './stripe-elements';
import { PayButtonContent, PaySteps, type PayStage } from '@/components/pay-steps';
import { MemberCard } from '@/components/member-card';

export type MemberPreview = { holder: string; number: string; since: string };

const AMOUNTS: Record<BillingPeriod, number> = { mensuel: Math.round(COMPLET_PRICES.mensuel.amount * 100), annuel: Math.round(COMPLET_PRICES.annuel.amount * 100) };

/** Souscription à la formule Complet, entièrement dans la page. */
export function CheckoutForm({
  trial,
  annualAvailable,
  billing,
  vatMention,
  initialPromo = '',
  member,
}: {
  trial: boolean;
  annualAvailable: boolean;
  billing: BillingDefaults;
  vatMention: string;
  initialPromo?: string;
  member: MemberPreview;
}) {
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
      <Form trial={trial} annualAvailable={annualAvailable} billing={billing} vatMention={vatMention} period={period} setPeriod={setPeriod} initialPromo={initialPromo} member={member} />
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
  initialPromo,
  member,
}: {
  trial: boolean;
  annualAvailable: boolean;
  billing: BillingDefaults;
  vatMention: string;
  period: BillingPeriod;
  setPeriod: (p: BillingPeriod) => void;
  initialPromo: string;
  member: MemberPreview;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const [promoInput, setPromoInput] = useState(initialPromo);
  const [promo, setPromo] = useState<PromoPreview | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [promoOpen, setPromoOpen] = useState(Boolean(initialPromo));
  const price = COMPLET_PRICES[period];
  const free = Boolean(promo?.free);
  // Paiement plus vivant : étapes cochées au fil de la saisie, carte de membre qui se remplit.
  const filled = (b: BillingDefaults) => Boolean(b.name.trim() && b.line1.trim() && b.postal_code.trim() && b.city.trim());
  const [billingName, setBillingName] = useState(billing.name);
  const [billingDone, setBillingDone] = useState(filled(billing));
  const [cardDone, setCardDone] = useState(false);
  const [stage, setStage] = useState<PayStage>(null);
  const [done, setDone] = useState<string | null>(null);
  function onFormInput() {
    const f = formRef.current;
    if (!f) return;
    const v = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | null)?.value ?? '';
    setBillingName(v('billing_name'));
    setBillingDone(filled({ ...billing, name: v('billing_name'), line1: v('billing_line1'), postal_code: v('billing_postal_code'), city: v('billing_city') }));
  }

  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(t);
  }, [ready]);

  async function applyPromo(code = promoInput, p = period): Promise<PromoPreview | null> {
    const clean = code.trim().toUpperCase();
    setPromoError(null);
    if (!clean) {
      setPromo(null);
      if (!trial) elements?.update({ amount: AMOUNTS[p] });
      return null;
    }
    setChecking(true);
    const res = await checkPromo(clean, p).catch(() => ({ error: 'Vérification impossible. Réessayez.' }));
    setChecking(false);
    if ('error' in res) {
      setPromo(null);
      setPromoError(res.error);
      if (!trial) elements?.update({ amount: AMOUNTS[p] });
      return null;
    }
    setPromo(res.ok);
    // Montant affiché par le formulaire de carte (paiement immédiat, hors essai).
    if (!trial && res.ok.firstCents > 0) elements?.update({ amount: res.ok.firstCents });
    return res.ok;
  }

  // Lien d'invitation : le code du parrain est vérifié et appliqué d'office.
  const autoApplied = useRef(false);
  useEffect(() => {
    if (!initialPromo || autoApplied.current || (!trial && !elements)) return;
    autoApplied.current = true;
    void applyPromo(initialPromo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPromo, elements]);

  function choose(p: BillingPeriod) {
    setPeriod(p);
    if (promo) void applyPromo(promo.code, p);
    else if (!trial) elements?.update({ amount: AMOUNTS[p] });
  }

  async function finish() {
    setStage(null);
    setDone(trial ? 'Essai activé !' : 'C’est fait !');
    await Promise.all([refreshSubscription().catch(() => null), new Promise((r) => setTimeout(r, 700))]);
    router.replace('/app/abonnement?statut=merci');
    router.refresh();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formRef.current || busy || (!free && (!stripe || !elements))) return;
    // Code saisi mais pas encore appliqué : on l'applique d'abord pour montrer la remise.
    if (promoInput.trim().toUpperCase() !== (promo?.code ?? '').toUpperCase()) {
      await applyPromo();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 1. Vérifie la carte saisie (format, date) avant tout appel au serveur. Pas de carte si le code rend l'abonnement gratuit.
      if (!free) {
        setStage({ label: 'Vérification de la carte…' });
        const check = await elements!.submit();
        if (check.error) throw new Error(check.error.message);
      }

      // 2. Le serveur enregistre la facturation et prépare l'opération.
      const fd = new FormData(formRef.current);
      fd.set('periode', period);
      fd.set('promo', promo?.code ?? '');
      setStage({ label: free ? 'Activation de la formule…' : 'Préparation de l’abonnement…' });
      const res = await startSubscription(fd);
      if ('error' in res) {
        if (res.field === 'promo') {
          setPromoOpen(true);
          setPromo(null);
          setPromoError(res.error);
        }
        if (res.field) formRef.current.querySelector<HTMLElement>(`[name="${res.field === 'promo' ? 'promo_saisi' : `billing_${res.field === 'vat_number' ? 'vat' : res.field}`}"]`)?.focus();
        throw new Error(res.error);
      }
      if (res.kind === 'done') return await finish();
      if (!stripe || !elements) throw new Error('Le formulaire de carte n’est pas chargé : rechargez la page.');

      const returnUrl = `${window.location.origin}/app/abonnement?retour=${res.kind === 'setup' ? 'essai' : 'paiement'}`;
      setStage({ label: res.kind === 'setup' ? 'Enregistrement de la carte…' : 'Validation par votre banque…' });
      if (res.kind === 'setup') {
        // 3a. Essai : la carte est enregistrée (validation bancaire si besoin), rien n'est débité.
        const { error: err, setupIntent } = await stripe.confirmSetup({ elements, clientSecret: res.clientSecret, confirmParams: { return_url: returnUrl }, redirect: 'if_required' });
        if (err) throw new Error(err.message);
        setStage({ label: 'Activation de votre essai…' });
        const activated = await activateTrial(setupIntent.id);
        if ('error' in activated) throw new Error(activated.error);
        return await finish();
      }
      // 3b. Premier paiement (validation bancaire 3-D Secure si la banque la demande).
      const { error: err } = await stripe.confirmPayment({ elements, clientSecret: res.clientSecret, confirmParams: { return_url: returnUrl }, redirect: 'if_required' });
      if (err) throw new Error(err.message);
      return await finish();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Le paiement n’a pas abouti. Réessayez.');
      setStage(null);
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} onInput={onFormInput} className="flex flex-col gap-6" noValidate={false}>
      <PaySteps
        steps={[
          { label: 'Formule', done: true },
          { label: 'Facturation', done: billingDone },
          { label: free ? 'Activation' : 'Carte', done: free || cardDone },
        ]}
      />

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

      {/* Code promotionnel */}
      <details className="text-sm" open={promoOpen} onToggle={(e) => setPromoOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer font-semibold text-brand">J’ai un code promotionnel</summary>
        <div className="mt-3 flex max-w-md flex-col gap-2">
          <label htmlFor="co-promo" className="font-semibold">
            Code promotionnel
          </label>
          <div className="flex gap-2">
            <Input
              id="co-promo"
              name="promo_saisi"
              maxLength={40}
              autoComplete="off"
              className="min-w-0 flex-1 uppercase"
              value={promoInput}
              onChange={(e) => {
                setPromoInput(e.target.value);
                setPromoError(null);
                if (promo && e.target.value.trim().toUpperCase() !== promo.code.toUpperCase()) {
                  setPromo(null);
                  if (!trial) elements?.update({ amount: AMOUNTS[period] });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void applyPromo();
                }
              }}
              aria-invalid={promoError ? true : undefined}
              aria-describedby="co-promo-msg"
            />
            <button type="button" onClick={() => void applyPromo()} disabled={checking || !promoInput.trim()} className={`${btn.secondary} shrink-0`}>
              {checking ? <span className="spinner" aria-hidden="true" /> : null}
              Appliquer
            </button>
          </div>
          <p id="co-promo-msg" aria-live="polite" className={promoError ? 'text-danger' : promo ? 'font-semibold text-success' : 'sr-only'}>
            {promoError ?? (promo ? `Code ${promo.code} appliqué : ${promo.summary}.` : '')}
          </p>
        </div>
      </details>

      {/* Paiement */}
      {free ? (
        <p className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          Avec ce code, la formule Complet vous est offerte sans limite de durée : aucune carte bancaire n’est demandée.
        </p>
      ) : null}
      <fieldset className={`flex flex-col gap-3 ${free ? 'hidden' : ''}`}>
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
          <PaymentElement onReady={() => setReady(true)} onChange={(e) => setCardDone(e.complete)} options={{ layout: 'tabs', terms: { card: 'never' }, wallets: { applePay: 'auto', googlePay: 'auto' } }} />
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl bg-ground p-4">
        <div className="mx-auto w-full max-w-[340px] py-1">
          <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-muted">Votre future carte de membre</p>
          <MemberCard farm={billingName} holder={member.holder} since={member.since} number={member.number} />
        </div>
        {promo && !free ? (
          <p className="flex items-baseline justify-between gap-3 text-sm">
            <span>Remise {promo.code}</span>
            <span className="tabular-nums text-success">{promo.summary}</span>
          </p>
        ) : null}
        <p className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">{trial || free ? 'À payer aujourd’hui' : 'Total'}</span>
          <span className="text-xl font-bold tabular-nums">
            {trial || free ? '0,00 €' : promo ? promo.firstLabel : price.label}
            {!trial && !free && promo && promo.firstLabel !== price.label ? <s className="ml-2 text-sm font-normal text-muted">{price.label}</s> : null}
          </span>
        </p>
        {free ? (
          <p className="text-sm text-muted">Une facture à 0,00 € est émise à chaque échéance. Vous pouvez résilier quand vous voulez depuis cette page.</p>
        ) : trial ? (
          <p className="text-sm text-muted">
            Puis {promo ? `${promo.firstLabel} ${price.period} (${promo.summary}, au lieu de ${price.label})` : `${price.label} ${price.period}`} à la fin de l’essai. Résiliable en un clic depuis cette page.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={(!free && (!stripe || !ready)) || busy || checking}
          className={`${btn.primary} w-full transition-colors ${done ? 'pay-btn-done !bg-success !text-page disabled:!opacity-100' : ''}`}
        >
          <PayButtonContent
            idle={free ? 'Activer la formule Complet' : trial ? `Démarrer mes ${TRIAL_DAYS} jours d’essai gratuit` : `Payer ${promo ? promo.firstLabel : price.label} et activer`}
            stage={busy ? (stage ?? { label: 'Validation…' }) : null}
            done={done}
          />
        </button>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
          <svg className="flex-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          Paiement chiffré par Stripe · Vos numéros de carte ne passent jamais par nos serveurs · Prix TTC, {vatMention}
        </p>
      </div>
    </form>
  );
}
