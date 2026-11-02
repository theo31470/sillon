'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AddressElement, Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Card, btn } from '@/components/ui';
import { PayButtonContent, type PayStage } from '@/components/pay-steps';
import { getStripe, publishableKey, stripeAppearance } from '../../abonnement/stripe-elements';
import { finishBoursePurchase, startBoursePurchase } from '../actions';

type Mode = 'envoi' | 'main_propre';
type Quote = { price: number; shipping: number; fee: number; total: number };
const euros = (cents: number) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export function BuyForm(props: {
  listing: { ref: string; title: string; photo: string | null; price: string; city: string };
  quotes: Record<Mode, Quote>;
  modes: Mode[];
  defaultName: string;
  vatMention: string;
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

function Form({ listing, quotes, modes, defaultName }: Parameters<typeof BuyForm>[0]) {
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
  const q = quotes[mode];

  useEffect(() => {
    elements?.update({ amount: q.total });
  }, [elements, q.total]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    if (!terms) return setError('Cochez la case des conditions de la bourse pour continuer.');
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
      const key = `${mode}-${q.total}-${JSON.stringify(recipient)}`;
      let p = prepared.current?.key === key ? prepared.current : null;
      if (!p) {
        setStage({ label: 'Préparation du paiement…' });
        const res = await startBoursePurchase({ ref: listing.ref, mode, recipient, expectedTotal: q.total, acceptedTerms: terms });
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
                    {m === 'main_propre' ? `Rendez-vous avec le vendeur, à ${listing.city}. Vous lui donnez votre code à la remise.` : `Livré chez vous ou en point relais : + ${euros(quotes.envoi.shipping)} de port.`}
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
              options={{ mode: 'shipping', allowedCountries: ['FR'], fields: { phone: 'always' }, validation: { phone: { required: 'always' } }, defaultValues: { name: defaultName, address: { country: 'FR' } } }}
            />
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
          {mode === 'envoi' ? <div className="flex justify-between gap-3"><dt className="text-muted">Frais de port</dt><dd className="tabular-nums">{euros(q.shipping)}</dd></div> : null}
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
        <button type="submit" disabled={!stripe || busy || !ready} aria-busy={busy} className={`${btn.primary} transition-colors ${done ? 'pay-btn-done !bg-success !text-page disabled:!opacity-100' : ''}`}>
          <PayButtonContent idle={`Payer ${euros(q.total)}`} stage={busy ? (stage ?? { label: 'Paiement en cours…' }) : null} done={done} />
        </button>
        <ul className="flex flex-col gap-1 text-xs text-muted">
          <li>✓ Le vendeur n’est payé qu’après {mode === 'main_propre' ? 'la remise, avec votre code' : 'la réception du colis'}</li>
          <li>✓ Remboursé si la vente n’a pas lieu</li>
        </ul>
      </Card>
    </form>
  );
}
