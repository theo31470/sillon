/**
 * Formules affichées sur le site. Les prix réellement facturés sont ceux
 * configurés dans Stripe (variables STRIPE_PRICE_COMPLET pour le mensuel et
 * STRIPE_PRICE_COMPLET_ANNUEL pour l'annuel) : gardez-les alignés avec ceux-ci.
 */
export const FREE_MACHINE_LIMIT = 3;
export const TRIAL_DAYS = 30;

/** Formule Complet : prix TTC (micro-entreprise, TVA non applicable). */
export const COMPLET_PRICES = {
  mensuel: { amount: 6.99, label: '6,99 €', period: '/ mois' },
  annuel: { amount: 69, label: '69 €', period: '/ an', perMonth: '5,75 €', saving: '2 mois offerts' },
} as const;
export type BillingPeriod = keyof typeof COMPLET_PRICES;
/** Économie de l'annuel par rapport à 12 mensualités, en %. */
export const ANNUAL_DISCOUNT = Math.round((1 - COMPLET_PRICES.annuel.amount / (COMPLET_PRICES.mensuel.amount * 12)) * 100);

export const PLANS = {
  free: {
    name: 'Gratuit',
    priceLabel: '0 €',
    period: '',
    features: [
      `Jusqu’à ${FREE_MACHINE_LIMIT} machines`,
      'Carnet d’entretien et rappels',
      'Relevés de compteur et dépenses',
      'Fiches techniques',
    ],
  },
  complet: {
    name: 'Complet',
    priceLabel: '6,99 €',
    period: '/ mois',
    features: [
      'Parc matériel illimité',
      'Coût de revient à l’heure, machine par machine',
      'Rapport d’historique pour la revente',
      'Aide au diagnostic des pannes',
      `${TRIAL_DAYS} jours d’essai gratuit`,
    ],
  },
  groupement: {
    name: 'CUMA & ETA',
    priceLabel: 'Sur devis',
    period: '',
    features: ['CUMA, entrepreneurs de travaux, GAEC', 'Matériel partagé entre plusieurs utilisateurs', 'Accompagnement à la prise en main'],
  },
} as const;
