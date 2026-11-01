'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { btn, Card } from '@/components/ui';
import { SHOP_MAX_QTY } from '@/lib/shop-shared';
import { checkoutCart, quoteCart, type CartQuote } from '../actions';
import { setQuantity, useCart } from '../cart-store';

const euros = (cents: number) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export function CartView({ demo, vatMention }: { demo: boolean; vatMention: string }) {
  const lines = useCart();
  const key = JSON.stringify(lines);
  const [quote, setQuote] = useState<{ key: string; value: CartQuote } | null>(null);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paying, startPaying] = useTransition();

  // Prix recalculés par le serveur à chaque changement du panier.
  useEffect(() => {
    if (!lines.length) return;
    let alive = true;
    quoteCart(lines).then(
      (value) => alive && setQuote({ key, value }),
      () => alive && setQuote({ key, value: { ok: false, error: 'La boutique ne répond pas pour le moment. Réessayez dans quelques minutes.' } }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- « key » résume le contenu du panier
  }, [key]);

  if (!lines.length) {
    return (
      <Card className="flex flex-col items-start gap-3">
        <p className="text-lg font-semibold">Votre panier est vide.</p>
        <Link href="/app/boutique" className={btn.primary}>Voir la boutique</Link>
      </Card>
    );
  }

  const current = quote?.key === key ? quote.value : null;
  const pay = () => {
    setError(null);
    startPaying(async () => {
      const r = await checkoutCart(lines, terms);
      if (r.ok) window.location.assign(r.url);
      else setError(r.error);
    });
  };

  return (
    <div className="flex flex-wrap items-start gap-5">
      <Card className="min-w-0 flex-[2_1_480px]">
        {!current ? (
          <p className="flex items-center gap-3 text-muted">
            <span className="spinner" aria-hidden="true" /> Calcul des prix et des frais de port…
          </p>
        ) : !current.ok ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{current.error}</p>
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
          <ul className="divide-y divide-line-soft">
            {current.items.map((i) => (
              <li key={i.variantId} className="flex gap-4 py-4 first:pt-0">
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
                    <span className="text-right font-semibold">
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
        )}
      </Card>

      <Card className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
        <h2 className="text-xl font-semibold">Récapitulatif</h2>
        {current?.ok ? (
          <dl className="flex flex-col gap-2 text-[15px]">
            <div className="flex justify-between gap-3"><dt className="text-muted">Articles</dt><dd>{euros(current.subtotal)}</dd></div>
            {current.discount ? (
              <div className="flex justify-between gap-3 text-brand-dark"><dt>{current.discountLabel}</dt><dd>−{euros(current.discount)}</dd></div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Livraison en France{current.delay ? <span className="block text-sm">{current.delay}</span> : null}</dt>
              <dd>{euros(current.shipping)}</dd>
            </div>
            <div className="mt-1 flex justify-between gap-3 border-t border-line pt-3 text-lg font-bold"><dt>Total</dt><dd>{euros(current.total)}</dd></div>
            <p className="text-xs text-muted">Prix TTC, {vatMention}.</p>
          </dl>
        ) : (
          <p className="text-sm text-muted">Le total s’affiche dès que les prix sont calculés.</p>
        )}

        {demo ? (
          <>
            <p className="rounded-[10px] bg-ground px-4 py-3 text-sm">Vous êtes sur la démo : créez votre compte gratuit pour commander.</p>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- navigation complète : la session de démo se pose par cookie */}
            <a href="/demo/fin" className={btn.primary}>Créer mon compte</a>
          </>
        ) : (
          <>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 size-5 flex-none accent-brand" />
              <span>
                J’accepte les{' '}
                <Link href="/conditions#boutique" target="_blank" className="font-semibold underline underline-offset-4">conditions de vente de la boutique</Link>{' '}
                (articles imprimés à la demande, livraison en France).
              </span>
            </label>
            {error ? <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
            <button type="button" onClick={pay} disabled={!current?.ok || paying} aria-busy={paying} className={btn.primary}>
              {paying ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Ouverture du paiement…
                </>
              ) : (
                'Payer en toute sécurité'
              )}
            </button>
            <p className="text-xs text-muted">Vous saisirez l’adresse de livraison et la carte sur la page sécurisée de Stripe.</p>
          </>
        )}
      </Card>
    </div>
  );
}
