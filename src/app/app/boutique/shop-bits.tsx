'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { cartCount, useCart } from './cart-store';

const euros = (cents: number) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

/** Lien vers le panier avec le nombre d'articles. */
export function CartLink({ className = '' }: { className?: string }) {
  const count = cartCount(useCart());
  const badge = useRef<HTMLSpanElement>(null);
  const previous = useRef<number | null>(null);
  // Un article ajouté : le panier sautille (pas au premier affichage).
  useEffect(() => {
    if (previous.current !== null && count > previous.current && badge.current) {
      badge.current.classList.remove('cart-bump');
      void badge.current.offsetWidth;
      badge.current.classList.add('cart-bump');
    }
    previous.current = count;
  }, [count]);
  return (
    <Link href="/app/boutique/panier" data-cart-target="" className={`btn inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-field bg-surface px-4 py-2 font-semibold hover:border-brand ${className}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 7h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
        <path d="M9 9V6a3 3 0 0 1 6 0v3" />
      </svg>
      Panier
      <span ref={badge} className={`rounded-full bg-brand px-2 text-sm text-on-brand ${count > 0 ? '' : 'hidden'}`}>{count}</span>
    </Link>
  );
}

/** Prix affiché : barré + prix membre quand la remise s'applique. */
export function Price({ cents, percent, from = false, large = false }: { cents: number; percent: number; from?: boolean; large?: boolean }) {
  const member = Math.round((cents * (100 - percent)) / 100);
  return (
    <span className={`flex flex-wrap items-baseline gap-x-2 ${large ? 'text-2xl' : ''}`}>
      {from ? <span className="text-sm font-normal text-muted">dès</span> : null}
      {percent > 0 ? (
        <>
          <span className="font-bold text-brand-dark">{euros(member)}</span>
          <s className="text-sm text-muted">{euros(cents)}</s>
        </>
      ) : (
        <span className="font-bold">{euros(cents)}</span>
      )}
    </span>
  );
}
