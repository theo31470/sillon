/**
 * Formules affichées sur le site. Le prix réel facturé est celui configuré
 * dans Stripe (variable STRIPE_PRICE_COMPLET) : pensez à garder les deux alignés.
 */
export const FREE_MACHINE_LIMIT = 3;
export const TRIAL_DAYS = 30;

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
    priceLabel: process.env.NEXT_PUBLIC_PRICE_COMPLET_LABEL ?? '[PRIX]',
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
