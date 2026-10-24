/**
 * Formules affichées sur le site. Le prix réel facturé est celui configuré
 * dans Stripe (variable STRIPE_PRICE_COMPLET) : pensez à garder les deux alignés.
 */
export const PLANS = {
  free: {
    name: 'Gratuit',
    priceLabel: '0 €',
    period: '',
    features: ['Jusqu’à 5 parcelles', 'Registre des interventions', 'Météo de l’exploitation', 'Fiches techniques en lecture'],
  },
  complet: {
    name: 'Complet',
    priceLabel: process.env.NEXT_PUBLIC_PRICE_COMPLET_LABEL ?? '[PRIX]',
    period: '/ mois',
    features: [
      'Parcelles illimitées',
      'Suivi du matériel et rappels d’entretien',
      'Aide au diagnostic des pannes',
      'Registre imprimable pour les contrôles',
      '30 jours d’essai gratuit',
    ],
  },
  groupement: {
    name: 'Groupement',
    priceLabel: 'Sur devis',
    period: '',
    features: ['CUMA, GAEC, coopératives', 'Plusieurs exploitations', 'Accompagnement à la prise en main'],
  },
} as const;

export const FREE_PARCEL_LIMIT = 5;
export const TRIAL_DAYS = 30;
