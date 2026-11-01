'use client';

import { useEffect } from 'react';
import { clearCart } from '../cart-store';

/** Commande payée : le panier est vidé. */
export function ClearCart() {
  useEffect(() => {
    clearCart();
  }, []);
  return null;
}
