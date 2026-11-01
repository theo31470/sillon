'use client';

import { useSyncExternalStore } from 'react';
import { SHOP_MAX_LINES, SHOP_MAX_QTY, type CartLine } from '@/lib/shop-shared';

/**
 * Panier gardé dans le navigateur (aucune donnée sensible : des numéros de
 * produits et des quantités). Les prix sont toujours recalculés par le serveur.
 */

const KEY = 'tc_panier';
const EVENT = 'tc-panier';
const EMPTY: CartLine[] = [];
let cache: { raw: string | null; lines: CartLine[] } = { raw: null, lines: EMPTY };

function read(): CartLine[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cache.lines;
  }
  if (raw === cache.raw) return cache.lines;
  let lines: CartLine[] = EMPTY;
  try {
    const parsed = JSON.parse(raw ?? '[]') as unknown;
    if (Array.isArray(parsed)) {
      lines = parsed
        .filter((l): l is CartLine => Boolean(l) && Number.isInteger(l.productId) && Number.isInteger(l.variantId) && Number.isInteger(l.quantity) && l.quantity > 0)
        .slice(0, SHOP_MAX_LINES);
    }
  } catch {
    /* panier illisible : on repart de zéro */
  }
  cache = { raw, lines };
  return lines;
}

function write(lines: CartLine[]) {
  const clean = lines.filter((l) => l.quantity > 0).slice(0, SHOP_MAX_LINES);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    // Stockage indisponible (navigation privée) : le panier vit le temps de la page.
    cache = { raw: `memoire-${Date.now()}`, lines: clean };
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function useCart() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export const cartCount = (lines: CartLine[]) => lines.reduce((t, l) => t + l.quantity, 0);

export function addToCart(line: CartLine) {
  const lines = read().map((l) => ({ ...l }));
  const same = lines.find((l) => l.variantId === line.variantId);
  if (same) same.quantity = Math.min(same.quantity + line.quantity, SHOP_MAX_QTY);
  else lines.push({ ...line, quantity: Math.min(line.quantity, SHOP_MAX_QTY) });
  write(lines);
}

export function setQuantity(variantId: number, quantity: number) {
  write(read().map((l) => (l.variantId === variantId ? { ...l, quantity: Math.max(0, Math.min(quantity, SHOP_MAX_QTY)) } : l)));
}

export function clearCart() {
  write([]);
}
