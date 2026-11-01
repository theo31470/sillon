'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ShopProduct } from '@/lib/printful';
import { SHOP_MAX_QTY, SHOP_MEMBER_DISCOUNT } from '@/lib/shop-shared';
import { btn } from '@/components/ui';
import { addToCart } from '../cart-store';
import { Price } from '../shop-bits';

export function ProductPicker({ product, percent, isPaid }: { product: ShopProduct; percent: number; isPaid: boolean }) {
  const firstAvailable = product.variants.find((v) => v.available) ?? product.variants[0];
  const [color, setColor] = useState(firstAvailable.color);
  const [size, setSize] = useState(firstAvailable.size);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  // Variante correspondant au choix ; une taille absente dans cette couleur bascule sur la première disponible.
  const forColor = useMemo(() => product.variants.filter((v) => v.color === color), [product.variants, color]);
  const variant = forColor.find((v) => v.size === size) ?? forColor.find((v) => v.available) ?? forColor[0] ?? firstAvailable;
  const image = variant.image ?? product.image;

  const add = () => {
    addToCart({ productId: product.id, variantId: variant.id, quantity });
    setAdded(true);
  };

  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-10">
      <div className="overflow-hidden rounded-2xl border border-line bg-[#f4f2ee]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- maquettes servies par Printful
          <img src={image} alt={`${product.name}${variant.color ? `, ${variant.color}` : ''}`} className="aspect-square size-full object-contain p-4" />
        ) : (
          <div className="aspect-square" />
        )}
      </div>

      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
          <div className="mt-2">
            <Price cents={variant.priceCents} percent={percent} large />
          </div>
          {percent ? (
            <p className="mt-1 text-sm text-brand-dark">Prix membre Complet (−{percent} %)</p>
          ) : !isPaid ? (
            <p className="mt-1 text-sm text-muted">
              −{SHOP_MEMBER_DISCOUNT} % avec la{' '}
              <Link href="/app/abonnement" className="font-semibold underline underline-offset-4">formule Complet</Link>
            </p>
          ) : null}
        </div>

        {product.colors.length > 1 ? (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Couleur : <span className="font-normal">{color}</span></legend>
            <div className="flex flex-wrap gap-2">
              {product.colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={c === color}
                  onClick={() => {
                    setColor(c);
                    setAdded(false);
                  }}
                  className={`min-h-10 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${c === color ? 'border-brand bg-brand text-on-brand' : 'border-field hover:border-brand'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {forColor.some((v) => v.size) ? (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Taille</legend>
            <div className="flex flex-wrap gap-2">
              {forColor.map((v) =>
                v.size ? (
                  <button
                    key={v.id}
                    type="button"
                    disabled={!v.available}
                    aria-pressed={v.id === variant.id}
                    onClick={() => {
                      setSize(v.size);
                      setAdded(false);
                    }}
                    className={`min-h-11 min-w-12 rounded-[10px] border px-3 py-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:line-through ${v.id === variant.id ? 'border-brand bg-brand-tint text-brand-dark' : 'border-field hover:border-brand'}`}
                  >
                    {v.size}
                  </button>
                ) : null,
              )}
            </div>
          </fieldset>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Quantité
            <select
              value={quantity}
              onChange={(e) => {
                setQuantity(Number(e.target.value));
                setAdded(false);
              }}
              className="min-h-12 rounded-[10px] border border-field bg-surface px-3 text-base"
            >
              {Array.from({ length: SHOP_MAX_QTY }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={add} disabled={!variant.available} className={`${btn.primary} flex-1`}>
            {variant.available ? 'Ajouter au panier' : 'Momentanément indisponible'}
          </button>
        </div>
        {added ? (
          <p role="status" className="flex flex-wrap items-center gap-3 rounded-[10px] bg-success-soft px-4 py-3 text-sm text-success">
            Ajouté au panier.
            <Link href="/app/boutique/panier" className="font-semibold underline underline-offset-4">Voir le panier</Link>
          </p>
        ) : null}

        <ul className="flex flex-col gap-2 border-t border-line pt-4 text-sm text-muted">
          <li>Imprimé à la demande en Europe, rien n’est produit en trop.</li>
          <li>Livraison en France, frais de port calculés au panier.</li>
          <li>Paiement sécurisé par carte, Apple Pay ou Google Pay.</li>
        </ul>
      </div>
    </div>
  );
}
