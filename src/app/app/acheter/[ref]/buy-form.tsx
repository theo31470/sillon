'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AddressElement, Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Card, btn } from '@/components/ui';
import { PayButtonContent, type PayStage } from '@/components/pay-steps';
import { getStripe, publishableKey, stripeAppearance } from '../../abonnement/stripe-elements';
import { finishBoursePurchase, getPickupPoints, getShippingOptions, startBoursePurchase } from '../actions';
import type { ParcelPointOption, ShippingOption } from '@/lib/bourse-shared';

type Mode = 'envoi' | 'main_propre';
type Quote = { price: number; shipping: number; fee: number; total: number };
const euros = (cents: number) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const km = (m: number | null) => (m === null ? '' : m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);
const etaLabel = (iso: string | null) => (iso ? `livraison prévue vers le ${new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}` : null);

export function BuyForm(props: {
  listing: { ref: string; title: string; photo: string | null; price: string; city: string };
  quotes: Record<Mode, Quote>;
  modes: Mode[];
  defaultName: string;
  vatMention: string;
  /** Port calculé par Boxtal selon l'adresse, avec choix du transporteur et du point relais. */
  autoShipping?: boolean;
}) {
  const stripePromise = useMemo(() => getStripe(), []);
  const appearance = useMemo(() => stripeAppearance(), []);
  const [initial] = useState(props.quotes[props.modes[0]].total);
  if (!publishableKey || !stripePromise) return <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">Le paiement en ligne est momentanément indisponible.</p>;
  return (
    <Elements
      stripe={stripePromise}
      options={{ mode: 'payment', amount: initial, currency: 'eur', allowedPaymentMethodTypes: ['card', 'paypal'], appearance, fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap' }] }}
    >
      <Form {...props} />
    </Elements>
  );
}

function Form({ listing, quotes, modes, defaultName, autoShipping = false }: Parameters<typeof BuyForm>[0]) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(modes[0]);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<PayStage>(null);
  const [done, setDone] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const prepared = useRef<{ key: string; orderId: string; clientSecret: string } | null>(null);

  // Envoi automatique : adresse → offres des transporteurs → point relais.
  const [addr, setAddr] = useState({ zip: '', city: '', street: '' });
  const [options, setOptions] = useState<ShippingOption[] | null>(null);
  const [optState, setOptState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const [offerCode, setOfferCode] = useState<string | null>(null);
  const [points, setPoints] = useState<ParcelPointOption[] | null>(null);
  const [pointState, setPointState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const [pointCode, setPointCode] = useState<string | null>(null);
  const auto = autoShipping && mode === 'envoi';
  const offer = options?.find((o) => o.code === offerCode) ?? null;

  const base = quotes[mode];
  const shipping = mode === 'envoi' ? (auto ? (offer?.price_cents ?? null) : base.shipping) : 0;
  const q = { price: base.price, shipping: shipping ?? 0, fee: base.fee, total: base.price + (shipping ?? 0) + base.fee };
  const placeKey = /^\d{5}$/.test(addr.zip) && addr.city.trim() ? `${addr.zip}|${addr.city.trim().toLowerCase()}` : null;

  useEffect(() => {
    elements?.update({ amount: q.total });
  }, [elements, q.total]);

  // Offres recalculées quand le code postal ou la commune changent.
  useEffect(() => {
    if (!auto || !placeKey) return;
    let live = true;
    const [zip, city] = placeKey.split('|');
    const t = setTimeout(async () => {
      setOptState({ loading: true, error: null });
      const res = await getShippingOptions({ ref: listing.ref, zip, city: addr.city.trim() || city }).catch(() => ({ ok: false as const, error: 'Connexion perdue : réessayez.' }));
      if (!live) return;
      if (res.ok) {
        setOptions(res.options);
        setOfferCode((cur) => (cur && res.options.some((o) => o.code === cur) ? cur : (res.options[0]?.code ?? null)));
        setOptState({ loading: false, error: null });
      } else {
        setOptions(null);
        setOfferCode(null);
        setOptState({ loading: false, error: res.error });
      }
    }, 450);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // La rue ne change pas le prix : seuls le code postal et la commune comptent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, placeKey, listing.ref]);

  // Points relais de l'offre choisie, autour de l'adresse.
  const pointKey = auto && offer?.delivery === 'PICKUP_POINT' && placeKey ? `${offer.code}|${placeKey}|${addr.street.trim().toLowerCase()}` : null;
  useEffect(() => {
    if (!pointKey || !offer) return;
    let live = true;
    const t = setTimeout(async () => {
      setPointState({ loading: true, error: null });
      const res = await getPickupPoints({ offerCode: offer.code, zip: addr.zip, city: addr.city.trim(), street: addr.street.trim() }).catch(() => ({ ok: false as const, error: 'Connexion perdue : réessayez.' }));
      if (!live) return;
      if (res.ok) {
        setPoints(res.points);
        setPointCode((cur) => (cur && res.points.some((p) => p.code === cur) ? cur : (res.points[0]?.code ?? null)));
        setPointState({ loading: false, error: null });
      } else {
        setPoints(null);
        setPointCode(null);
        setPointState({ loading: false, error: res.error });
      }
    }, 500);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointKey]);

  const needsPoint = auto && offer?.delivery === 'PICKUP_POINT';
  const shippingReady = !auto || (offer !== null && (!needsPoint || pointCode !== null));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    if (!terms) return setError('Cochez la case des conditions de la bourse pour continuer.');
    if (auto && !offer) return setError('Indiquez votre adresse puis choisissez un mode de livraison.');
    if (needsPoint && !pointCode) return setError('Choisissez votre point relais.');
    setBusy(true);
    setError(null);
    try {
      setStage({ label: 'Vérification…' });
      const check = await elements.submit();
      if (check.error) throw new Error(check.error.message);
      let recipient = null;
      if (mode === 'envoi') {
        const a = await elements.getElement('address')?.getValue();
        if (!a?.complete) throw new Error('Adresse de livraison incomplète.');
        const v = a.value;
        recipient = { name: v.name, address1: v.address.line1, address2: v.address.line2 ?? null, city: v.address.city, zip: v.address.postal_code, phone: v.phone ?? '' };
      }
      const key = `${mode}-${q.total}-${offerCode}-${pointCode}-${JSON.stringify(recipient)}`;
      let p = prepared.current?.key === key ? prepared.current : null;
      if (!p) {
        setStage({ label: 'Préparation du paiement…' });
        const res = await startBoursePurchase({ ref: listing.ref, mode, recipient, expectedTotal: q.total, acceptedTerms: terms, offerCode: auto ? offerCode : null, pickupPointCode: needsPoint ? pointCode : null });
        if (!res.ok) throw new Error(res.error);
        p = { key, orderId: res.orderId, clientSecret: res.clientSecret };
        prepared.current = p;
      }
      setStage({ label: 'Paiement sécurisé…' });
      const { error: err } = await stripe.confirmPayment({
        elements,
        clientSecret: p.clientSecret,
        confirmParams: { return_url: `${window.location.origin}/app/transactions/${p.orderId}?fete=1` },
        redirect: 'if_required',
      });
      if (err) throw new Error(err.message);
      setStage({ label: 'Réservation de l’annonce…' });
      await finishBoursePurchase(p.orderId).catch(() => null);
      setStage(null);
      setDone('Achat confirmé !');
      await new Promise((r) => setTimeout(r, 650));
      router.push(`/app/transactions/${p.orderId}?fete=1`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Le paiement n’a pas abouti. Réessayez.');
      setStage(null);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-5">
      <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-5">
        {modes.length > 1 ? (
          <Card className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Remise</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {modes.map((m) => (
                <label key={m} className={`flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-4 transition-colors ${mode === m ? 'border-brand bg-brand-tint' : 'border-line hover:border-field'}`}>
                  <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} disabled={busy} className="sr-only" />
                  <span className="font-semibold">{m === 'main_propre' ? 'En main propre' : 'Envoi par colis'}</span>
                  <span className="text-sm text-muted">
                    {m === 'main_propre'
                      ? `Rendez-vous avec le vendeur, à ${listing.city}. Vous lui donnez votre code à la remise.`
                      : autoShipping
                        ? 'Mondial Relay, Chronopost, Colissimo… en point relais ou à domicile, au prix réel selon votre adresse.'
                        : `Livré chez vous : + ${euros(quotes.envoi.shipping)} de port.`}
                  </span>
                </label>
              ))}
            </div>
          </Card>
        ) : null}

        {mode === 'envoi' ? (
          <Card className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Adresse de livraison</h2>
            <AddressElement
              onChange={(e) => {
                const a = e.value.address;
                setAddr((cur) => (cur.zip === (a.postal_code ?? '') && cur.city === (a.city ?? '') && cur.street === (a.line1 ?? '') ? cur : { zip: a.postal_code ?? '', city: a.city ?? '', street: a.line1 ?? '' }));
              }}
              options={{ mode: 'shipping', allowedCountries: ['FR'], fields: { phone: 'always' }, validation: { phone: { required: 'always' } }, defaultValues: { name: defaultName, address: { country: 'FR' } } }}
            />
          </Card>
        ) : null}

        {auto ? (
          <Card className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Livraison</h2>
            {!placeKey ? <p className="text-sm text-muted">Indiquez votre code postal et votre commune : les tarifs des transporteurs s’affichent ici.</p> : null}
            {placeKey && optState.loading && !options ? <p className="flex items-center gap-2 text-sm text-muted"><span className="spinner" aria-hidden="true" /> Calcul des frais de port…</p> : null}
            {optState.error ? <p role="alert" className="rounded-[10px] bg-warn-soft px-4 py-3 text-sm text-warn">{optState.error}</p> : null}
            {options?.length ? (
              <div className={`flex flex-col gap-2 transition-opacity ${optState.loading ? 'opacity-60' : ''}`} role="radiogroup" aria-label="Mode de livraison">
                {options.map((o) => (
                  <label key={o.code} className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 transition-colors ${offerCode === o.code ? 'border-brand bg-brand-tint' : 'border-line hover:border-field'}`}>
                    <input type="radio" name="offer" value={o.code} checked={offerCode === o.code} onChange={() => setOfferCode(o.code)} disabled={busy} className="size-5 flex-none accent-brand" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        {o.carrier} · {o.delivery === 'PICKUP_POINT' ? 'point relais' : 'à domicile'}
                      </span>
                      <span className="block text-sm text-muted">{etaLabel(o.eta) ?? o.service}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{euros(o.price_cents)}</span>
                  </label>
                ))}
              </div>
            ) : null}

            {needsPoint ? (
              <div className="mt-2 flex flex-col gap-2">
                <h3 className="font-semibold">Votre point relais {offer ? `${offer.carrier}` : ''}</h3>
                {pointState.loading && !points ? <p className="flex items-center gap-2 text-sm text-muted"><span className="spinner" aria-hidden="true" /> Recherche des points relais…</p> : null}
                {pointState.error ? <p role="alert" className="rounded-[10px] bg-warn-soft px-4 py-3 text-sm text-warn">{pointState.error}</p> : null}
                {points?.length ? (
                  <div className={`flex max-h-80 flex-col gap-2 overflow-y-auto pr-1 transition-opacity ${pointState.loading ? 'opacity-60' : ''}`} role="radiogroup" aria-label="Point relais">
                    {points.map((p) => (
                      <label key={p.code} className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors ${pointCode === p.code ? 'border-brand bg-brand-tint' : 'border-line hover:border-field'}`}>
                        <input type="radio" name="point" value={p.code} checked={pointCode === p.code} onChange={() => setPointCode(p.code)} disabled={busy} className="mt-0.5 size-5 flex-none accent-brand" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">
                            {p.name}
                            {p.locker ? <span className="ml-2 rounded-full bg-ground px-2 py-0.5 text-xs font-semibold text-muted">Casier 24/7</span> : null}
                          </span>
                          <span className="block text-sm text-muted">{p.street}, {p.zip} {p.city}</span>
                        </span>
                        {p.distance !== null ? <span className="flex-none text-sm text-muted tabular-nums">{km(p.distance)}</span> : null}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>
        ) : null}

        <Card className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Paiement</h2>
          <p className="text-sm text-muted">Carte bancaire, Apple Pay, Google Pay ou PayPal. L’argent est conservé par Tracteurs & Co jusqu’à ce que vous ayez le matériel.</p>
          {!ready ? <p className="text-sm text-muted">Chargement du formulaire sécurisé…</p> : null}
          <PaymentElement onReady={() => setReady(true)} options={{ layout: 'tabs', terms: { card: 'never' }, wallets: { applePay: 'auto', googlePay: 'auto' } }} />
        </Card>
      </div>

      <Card className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 lg:sticky lg:top-6">
        <div className="flex gap-3">
          <span className="size-16 flex-none overflow-hidden rounded-xl bg-ground">
            {listing.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- photo de l'annonce
              <img src={listing.photo} alt="" className="size-full object-cover" />
            ) : null}
          </span>
          <span className="min-w-0">
            <span className="line-clamp-2 font-semibold">{listing.title}</span>
            <span className="text-sm text-muted">{listing.city}</span>
          </span>
        </div>
        <dl className="flex flex-col gap-2 text-[15px]">
          <div className="flex justify-between gap-3"><dt className="text-muted">Prix</dt><dd className="tabular-nums">{euros(q.price)}</dd></div>
          {mode === 'envoi' ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Frais de port{offer ? <span className="block text-xs">{offer.carrier}</span> : null}</dt>
              <dd className="tabular-nums">{shipping === null ? <span className="text-sm text-muted">selon l’adresse</span> : euros(shipping)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Frais de service<span className="block text-xs">paiement sécurisé, remboursement si problème</span></dt>
            <dd className="tabular-nums">{euros(q.fee)}</dd>
          </div>
          <div className="mt-1 flex justify-between gap-3 border-t border-line pt-3 text-lg font-bold"><dt>Total</dt><dd className="tabular-nums">{euros(q.total)}</dd></div>
        </dl>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 size-5 flex-none accent-brand" />
          <span>
            J’accepte les{' '}
            <Link href="/conditions#bourse" target="_blank" className="font-semibold underline underline-offset-4">conditions de la bourse</Link>
          </span>
        </label>
        {error ? <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
        <button type="submit" disabled={!stripe || busy || !ready || !shippingReady} aria-busy={busy} className={`${btn.primary} transition-colors ${done ? 'pay-btn-done !bg-success !text-page disabled:!opacity-100' : ''}`}>
          <PayButtonContent idle={shippingReady ? `Payer ${euros(q.total)}` : 'Choisissez la livraison'} stage={busy ? (stage ?? { label: 'Paiement en cours…' }) : null} done={done} />
        </button>
        <ul className="flex flex-col gap-1 text-xs text-muted">
          <li>✓ Le vendeur n’est payé qu’après {mode === 'main_propre' ? 'la remise, avec votre code' : 'la réception du colis'}</li>
          <li>✓ Remboursé si la vente n’a pas lieu</li>
          {auto ? <li>✓ Bordereau prépayé et suivi automatique</li> : null}
        </ul>
      </Card>
    </form>
  );
}
