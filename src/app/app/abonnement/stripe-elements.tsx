'use client';

import { loadStripe, type Appearance, type Stripe } from '@stripe/stripe-js';

/**
 * Stripe.js côté navigateur : les champs de carte sont des cadres hébergés
 * par Stripe, intégrés à la page. Les numéros de carte ne passent jamais par
 * Tracteurs & Co (conformité PCI DSS assurée par Stripe).
 */

let promise: Promise<Stripe | null> | null = null;

export const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export function getStripe() {
  if (!publishableKey) return null;
  // Échec de chargement (bloqueur, réseau) : null, l'écran affiche un message au lieu d'attendre.
  promise ??= loadStripe(publishableKey, { locale: 'fr' }).catch(() => {
    promise = null;
    return null;
  });
  return promise;
}

/** Aux couleurs du site, en mode sombre ou clair selon le thème choisi. */
export function stripeAppearance(): Appearance {
  const dark = typeof document === 'undefined' || document.documentElement.dataset.theme !== 'light';
  return {
    theme: dark ? 'night' : 'stripe',
    variables: {
      colorPrimary: '#E0875A',
      colorBackground: dark ? '#1e1b18' : '#ffffff',
      colorText: dark ? '#f3efe9' : '#1b1916',
      colorTextSecondary: dark ? '#ada497' : '#6b6358',
      colorDanger: dark ? '#f08a7a' : '#8a2a1c',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSizeBase: '16px',
      borderRadius: '10px',
      spacingUnit: '4px',
    },
    rules: {
      '.Input': { padding: '12px 14px', boxShadow: 'none', borderColor: dark ? '#4d463d' : '#cdc4b7' },
      '.Input:focus': { borderColor: '#E0875A', boxShadow: '0 0 0 3px rgba(224,135,90,0.2)' },
      '.Label': { fontWeight: '600', fontSize: '14px' },
    },
  };
}
