import type { Plan } from '@/lib/types';

/** Boutique : règles communes au serveur et au navigateur. */

export type CartLine = { productId: number; variantId: number; quantity: number };

/** Remise des formules payantes sur la boutique, en %. */
export const SHOP_MEMBER_DISCOUNT = 10;
export const SHOP_MAX_QTY = 10;
export const SHOP_MAX_LINES = 20;

export const shopDiscountPercent = (plan: Plan) => (plan === 'free' ? 0 : SHOP_MEMBER_DISCOUNT);

export const SHOP_STATUS_LABELS = {
  pending: 'En attente de paiement',
  paid: 'Payée',
  submitted: 'En préparation',
  shipped: 'Expédiée',
  failed: 'En vérification',
  canceled: 'Annulée',
  refunded: 'Remboursée',
  abandoned: 'Paiement abandonné',
} as const;
