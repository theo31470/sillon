'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AddressElement, Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { btn, Card } from '@/components/ui';
import { SHOP_MAX_QTY } from '@/lib/shop-shared';
import { getStripe, publishableKey, stripeAppearance } from '../../abonnement/stripe-elements';
import { PayButtonContent, PaySteps, type PayStage } from '@/components/pay-steps';
import { finishPayment, quoteCart, startPayment, type CartQuote } from '../actions';
import { setQuantity, useCart } from '../cart-store';

const euros = (cents: number) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const UNAVAILABLE = 'La boutique ne répond pas pour le moment. Réessayez dans quelques minutes.';

type OkQuote = Extract<CartQuote, { ok: true }>;

export function CartView({ demo, vatMention, defaultName }: { demo: boolean; vatMention: string; defaultName: string }) {
  const lines = useCart();
  const key = JSON.stringify(lines);
  const [nonce, setNonce] = useState(0);
  const [quote, setQuote] = useState<{ key: string; value: CartQuote } | null>(null);
  const [lastOk, setLastOk] = useState<OkQuote | null>(null);

  // Prix et frais de port recalculés par le serveur à chaque changement du panier.
  useEffect(() => {
    if (!lines.length) return;
    let alive = true;
    quoteCart(lines).then(
      (value) => {
        if (!alive) return;
        setQuote({ key, value });
        if (value.ok) setLastOk(value);
      },
      () => alive && setQuote({ key, value: { ok: false, error: UNAVAILABLE } }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- « key » résume le contenu du panier
  }, [key, nonce]);

  if (!lines.length) {
    return (
      <Card className="flex flex-col items-start gap-3">
        <p className="text-lg font-semibold">Votre panier est vide.</p>
        <Link href="/app/boutique" className={btn.primary}>Voir la boutique</Link>
      </Card>
    );
  }

  const fresh = quote?.key === key;
  const failed = fresh && quote && !quote.value.ok ? quote.value.error : null;
  // Pendant un recalcul, on garde l'affichage précédent (et le formulaire de paiement) au lieu de tout effacer.
  const shown = failed ? null : fresh && quote?.value.ok ? quote.value : lastOk;
  const updating = !fresh;

  if (!shown) {
    return (
      <Card>
        {failed ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{failed}</p>
            <ul className="divide-y divide-line-soft">
              {lines.map((l) => (
                <li key={l.variantId} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span>Article n° {l.variantId} × {l.quantity}</span>
                  <button type="button" onClick={() => setQuantity(l.variantId, 0)} className="font-semibold text-danger hover:underline">Retirer</button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-3 text-muted">
            <span className="spinner" aria-hidden="true" /> Calcul des prix et des frais de port…
          </p>
        )}
      </Card>
    );
  }

  const items = (
    <Card className="min-w-0">
      <h2 className="mb-2 text-xl font-semibold">Articles</h2>
      <ul className="divide-y divide-line-soft">
        {shown.items.map((i) => (
          <li key={i.variantId} className="flex gap-4 py-4 last:pb-0">
            <Link href={`/app/boutique/${i.productId}`} className="size-20 flex-none overflow-hidden rounded-xl bg-[#f4f2ee]">
              {i.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- maquettes servies par Printful
                <img src={i.image} alt="" className="size-full object-contain p-1" />
              ) : null}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap justify-between gap-x-4">
                <span className="min-w-0">
                  <span className="block font-semibold">{i.name}</span>
                  {i.detail ? <span className="text-sm text-muted">{i.detail}</span> : null}
                </span>
                <span className="text-right font-semibold tabular-nums">
                  {euros(i.unitCents * i.quantity)}
                  {i.unitCents < i.listCents ? <s className="block text-sm font-normal text-muted">{euros(i.listCents * i.quantity)}</s> : null}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <label className="sr-only" htmlFor={`qte-${i.variantId}`}>Quantité de {i.name}</label>
                <select
                  id={`qte-${i.variantId}`}
                  value={i.quantity}
                  onChange={(e) => setQuantity(i.variantId, Number(e.target.value))}
                  className="min-h-10 rounded-lg border border-field bg-surface px-2 text-sm"
                >
                  {Array.from({ length: SHOP_MAX_QTY }, (_, n) => n + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setQuantity(i.variantId, 0)} className="text-sm font-semibold text-danger hover:underline">Retirer</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );

  const summary = (
    <dl className="flex flex-col gap-2 text-[15px]" aria-busy={updating}>
      <div className="flex justify-between gap-3"><dt className="text-muted">Articles</dt><dd className="tabular-nums">{euros(shown.subtotal)}</dd></div>
      {shown.discount ? (
        <div className="flex justify-between gap-3 text-brand-dark"><dt>{shown.discountLabel}</dt><dd className="tabular-nums">−{euros(shown.discount)}</dd></div>
      ) : null}
      <div className="flex justify-between gap-3">
        <dt className="text-muted">Livraison en France{shown.delay ? <span className="block text-sm">{shown.delay}</span> : null}</dt>
        <dd className="tabular-nums">{euros(shown.shipping)}</dd>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-line pt-3 text-lg font-bold">
        <dt>Total</dt>
        <dd className="flex items-center gap-2 tabular-nums">{updating ? <span className="spinner" aria-label="Recalcul" /> : null}{euros(shown.total)}</dd>
      </div>
      <p className="text-xs text-muted">Prix TTC, {vatMention}.</p>
    </dl>
  );

  if (demo) {
    return (
      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[2_1_480px]">{items}</div>
        <Card className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <h2 className="text-xl font-semibold">Récapitulatif</h2>
          {summary}
          <p className="rounded-[10px] bg-ground px-4 py-3 text-sm">Vous êtes sur la démo : créez votre compte gratuit pour commander.</p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- navigation complète : la session de démo se pose par cookie */}
          <a href="/demo/fin" className={btn.primary}>Créer mon compte</a>
        </Card>
      </div>
    );
  }

  return (
    <StripeCheckout total={shown.total}>
      <CheckoutForm items={items} summary={summary} total={shown.total} updating={updating} cartKey={key} defaultName={defaultName} onPriceChanged={() => setNonce((n) => n + 1)} />
    </StripeCheckout>
  );
}

function StripeCheckout({ total, children }: { total: number; children: React.ReactNode }) {
  const stripePromise = useMemo(() => getStripe(), []);
  const appearance = useMemo(() => stripeAppearance(), []);
  // Montant de départ seulement : les changements passent ensuite par elements.update (le formulaire garde sa saisie).
  const [initialAmount] = useState(total);
  if (!publishableKey || !stripePromise) {
    return <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">Le paiement en ligne est momentanément indisponible. Réessayez un peu plus tard.</p>;
  }
  return (
    <Elements
      stripe={stripePromise}
      options={{
        mode: 'payment',
        amount: initialAmount,
        currency: 'eur',
        allowedPaymentMethodTypes: ['card'],
        appearance,
        fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap' }],
      }}
    >
      {children}
    </Elements>
  );
}

function CheckoutForm({
  items,
  summary,
  total,
  updating,
  cartKey,
  defaultName,
  onPriceChanged,
}: {
  items: React.ReactNode;
  summary: React.ReactNode;
  total: number;
  updating: boolean;
  cartKey: string;
  defaultName: string;
  onPriceChanged: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const lines = useCart();
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState({ address: false, payment: false });
  const [stage, setStage] = useState<PayStage>(null);
  const [done, setDone] = useState<string | null>(null);
  const [shipTo, setShipTo] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  // Trois écrans : panier, livraison, paiement (adresse dans l'URL : le bouton « retour » du téléphone fonctionne).
  const params = useSearchParams();
  const wanted = params.get('etape') === 'paiement' ? 3 : params.get('etape') === 'livraison' ? 2 : 1;
  const step = wanted === 3 && !shipTo ? 2 : wanted;
  const goTo = (n: 1 | 2 | 3) => {
    setError(null);
    setStepError(null);
    window.history.pushState(null, '', n === 1 ? '/app/boutique/panier' : `/app/boutique/panier?etape=${n === 2 ? 'livraison' : 'paiement'}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  async function toPayment() {
    const address = await elements?.getElement('address')?.getValue();
    if (!address?.complete) {
      setStepError('Complétez l’adresse de livraison et le téléphone pour continuer.');
      return;
    }
    const v = address.value;
    setShipTo([v.name, v.address.line1, v.address.line2, `${v.address.postal_code} ${v.address.city}`].filter(Boolean).join(', '));
    goTo(3);
  }
  // Paiement déjà préparé pour ce panier et ce montant : réutilisé si la carte est refusée puis ressaisie.
  const prepared = useRef<{ key: string; total: number; orderId: string; clientSecret: string } | null>(null);

  useEffect(() => {
    elements?.update({ amount: total });
  }, [elements, total]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy || updating) return;
    if (!terms) {
      setError('Cochez la case des conditions de vente pour continuer.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 1. Adresse et carte vérifiées dans la page, avant tout appel au serveur.
      setStage({ label: 'Vérification…' });
      const check = await elements.submit();
      if (check.error) throw new Error(check.error.message);
      const address = await elements.getElement('address')?.getValue();
      if (!address?.complete) throw new Error('Adresse de livraison incomplète.');
      const v = address.value;

      // 2. Le serveur recalcule le total, crée la commande et le paiement.
      let p = prepared.current?.key === cartKey && prepared.current.total === total ? prepared.current : null;
      if (!p) {
        setStage({ label: 'Préparation de la commande…' });
        const res = await startPayment(
          lines,
          { name: v.name, address1: v.address.line1, address2: v.address.line2 ?? null, city: v.address.city, zip: v.address.postal_code, country_code: v.address.country as 'FR', phone: v.phone ?? '' },
          total,
          terms,
        );
        if (!res.ok) {
          if (res.changed) onPriceChanged();
          throw new Error(res.error);
        }
        p = { key: cartKey, total, orderId: res.orderId, clientSecret: res.clientSecret };
        prepared.current = p;
      }

      // 3. Paiement dans la page (validation 3-D Secure si la banque la demande).
      setStage({ label: 'Paiement sécurisé…' });
      const returnUrl = `${window.location.origin}/app/boutique/merci?commande=${p.orderId}&fete=1`;
      const { error: err } = await stripe.confirmPayment({ elements, clientSecret: p.clientSecret, confirmParams: { return_url: returnUrl }, redirect: 'if_required' });
      if (err) throw new Error(err.message);

      // 4. La commande part chez Printful, puis page de remerciement.
      setStage({ label: 'Envoi à l’atelier d’impression…' });
      await finishPayment(p.orderId).catch(() => null);
      setStage(null);
      setDone('Commande validée !');
      await new Promise((r) => setTimeout(r, 650));
      router.push(`/app/boutique/merci?commande=${p.orderId}&fete=1`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Le paiement n’a pas abouti. Réessayez.');
      setStage(null);
      setBusy(false);
    }
  }

  const titles = { 1: 'Mon panier', 2: 'Livraison', 3: 'Paiement' } as const;
  const back = step === 2 ? { label: '← Retour au panier', to: 1 as const } : step === 3 ? { label: '← Modifier la livraison', to: 2 as const } : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <PaySteps
        steps={[
          { label: 'Panier', done: step > 1 },
          { label: 'Livraison', done: step > 2 },
          { label: 'Paiement', done: Boolean(done) },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 key={step} className="celebrate-rise text-2xl font-bold tracking-tight">{titles[step]}</h2>
        {back ? (
          <button type="button" onClick={() => goTo(back.to)} disabled={busy} className="font-semibold text-brand-dark hover:underline">
            {back.label}
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-5">
          {step === 1 ? <div key="articles" className="celebrate-rise">{items}</div> : null}

          {/* Les formulaires Stripe restent montés d'un écran à l'autre : rien de ce qui est saisi ne se perd. */}
          <Card className={`flex flex-col gap-3 ${step === 2 ? 'celebrate-rise' : 'hidden'}`}>
            <p className="text-sm text-muted">En France métropolitaine. Le téléphone sert uniquement au transporteur.</p>
            {!ready.address ? <p className="text-sm text-muted">Chargement…</p> : null}
            <AddressElement
              onReady={() => setReady((r) => ({ ...r, address: true }))}
              onChange={(e) => {
                if (e.complete) setStepError(null);
              }}
              options={{
                mode: 'shipping',
                allowedCountries: ['FR'],
                fields: { phone: 'always' },
                validation: { phone: { required: 'always' } },
                defaultValues: { name: defaultName, address: { country: 'FR' } },
              }}
            />
          </Card>

          <Card className={`flex flex-col gap-3 ${step === 3 ? 'celebrate-rise' : 'hidden'}`}>
            <p className="flex items-start gap-2 text-sm text-muted">
              <svg className="mt-0.5 flex-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              Carte bancaire, Apple Pay ou Google Pay. Paiement sécurisé par Stripe : vos numéros de carte ne passent jamais par Tracteurs & Co.
            </p>
            {!ready.payment ? <p className="text-sm text-muted">Chargement du formulaire sécurisé…</p> : null}
            <PaymentElement
              onReady={() => setReady((r) => ({ ...r, payment: true }))}
              options={{ layout: 'tabs', terms: { card: 'never' }, wallets: { applePay: 'auto', googlePay: 'auto' } }}
            />
          </Card>
        </div>

        <Card className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 lg:sticky lg:top-6">
          <h2 className="text-xl font-semibold">Récapitulatif</h2>
          {summary}
          {step > 1 ? (
            <button type="button" onClick={() => goTo(1)} disabled={busy} className="self-start text-sm font-semibold text-brand-dark hover:underline">
              Modifier le panier
            </button>
          ) : null}

          {step === 1 ? (
            <button type="button" onClick={() => goTo(2)} disabled={updating} className={btn.primary}>
              Continuer vers la livraison
            </button>
          ) : null}

          {step === 2 ? (
            <>
              {stepError ? <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{stepError}</p> : null}
              <button type="button" onClick={() => void toPayment()} disabled={!ready.address} className={btn.primary}>
                Continuer vers le paiement
              </button>
            </>
          ) : null}

          {step === 3 ? (
            <>
              {shipTo ? (
                <div className="flex items-start justify-between gap-3 rounded-[10px] bg-ground px-4 py-3 text-sm">
                  <span>
                    <span className="block font-semibold">Livraison à</span>
                    <span className="text-muted">{shipTo}</span>
                  </span>
                  <button type="button" onClick={() => goTo(2)} disabled={busy} className="flex-none font-semibold text-brand-dark hover:underline">
                    Modifier
                  </button>
                </div>
              ) : null}
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 size-5 flex-none accent-brand" />
                <span>
                  J’accepte les{' '}
                  <Link href="/conditions#boutique" target="_blank" className="font-semibold underline underline-offset-4">conditions de vente de la boutique</Link>{' '}
                  (articles imprimés à la demande, livraison en France).
                </span>
              </label>
              {error ? <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
              <button
                type="submit"
                disabled={!stripe || busy || updating || !ready.payment}
                aria-busy={busy}
                className={`${btn.primary} transition-colors ${done ? 'pay-btn-done !bg-success !text-page disabled:!opacity-100' : ''}`}
              >
                <PayButtonContent idle={`Payer ${euros(total)}`} stage={busy ? (stage ?? { label: 'Paiement en cours…' }) : null} done={done} />
              </button>
              <p className="text-xs text-muted">Confirmation par e-mail, puis numéro de suivi dès l’expédition.</p>
            </>
          ) : null}
        </Card>
      </div>
    </form>
  );
}
