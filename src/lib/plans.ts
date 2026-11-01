/**
 * Formules affichées sur le site. Les prix réellement facturés sont ceux
 * configurés dans Stripe (variables STRIPE_PRICE_COMPLET pour le mensuel et
 * STRIPE_PRICE_COMPLET_ANNUEL pour l'annuel) : gardez-les alignés avec ceux-ci.
 */
export const FREE_MACHINE_LIMIT = 3;
export const TRIAL_DAYS = 30;
/** Aide au diagnostic (formule Complet) : quota compté en base, voir src/lib/diagnostic-quota.ts. */
export const DIAGNOSTIC_MONTHLY_LIMIT = 30;
export const DIAGNOSTIC_DAILY_LIMIT = 10;
/** Factures d'atelier lues par Claude, par mois (formule Complet). */
export const INVOICE_READINGS_MONTHLY = 30;
/** Personnes invitées sur le parc en plus du titulaire (formule Complet). */
export const TEAM_GUESTS = 2;

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
      'Fiches techniques, et demande des modèles manquants',
    ],
  },
  complet: {
    name: 'Complet',
    priceLabel: '6,99 €',
    period: '/ mois',
    features: [
      'Parc matériel illimité',
      `Factures du garage lues en photo (${INVOICE_READINGS_MONTHLY} par mois)`,
      `Partage du parc : ${TEAM_GUESTS + 1} personnes (salarié, associé, mécanicien)`,
      'Coût de revient à l’heure, machine par machine',
      `Aide au diagnostic des pannes (${DIAGNOSTIC_MONTHLY_LIMIT} par mois)`,
      'Rapport d’historique pour la revente',
      `${TRIAL_DAYS} jours d’essai gratuit`,
    ],
  },
  groupement: {
    name: 'CUMA & ETA',
    priceLabel: 'Sur devis',
    period: '',
    features: ['CUMA, entrepreneurs de travaux, grands GAEC', `Plus de ${TEAM_GUESTS + 1} personnes sur le même parc`, 'Lectures de factures et diagnostics à volonté', 'Accompagnement à la prise en main'],
  },
} as const;
