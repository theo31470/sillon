import { slugify } from '@/lib/format';

/** Bourse au matériel : règles communes au serveur et au navigateur. */

export const LISTING_CATEGORIES = {
  tracteur: 'Tracteurs',
  recolte: 'Récolte (moissonneuses, ensileuses…)',
  travail_sol: 'Travail du sol',
  semis: 'Semis et plantation',
  pulverisation: 'Pulvérisation et épandage',
  fenaison: 'Fenaison',
  elevage: 'Élevage',
  manutention: 'Manutention (télescopiques, chargeurs…)',
  remorque: 'Remorques et transport',
  pieces: 'Pièces détachées',
  pneus: 'Pneus et roues',
  outillage: 'Outillage et atelier',
  autre: 'Autre',
} as const;
export type ListingCategory = keyof typeof LISTING_CATEGORIES;

/** Libellés courts pour les filtres et les badges. */
export const CATEGORY_SHORT: Record<ListingCategory, string> = {
  tracteur: 'Tracteurs',
  recolte: 'Récolte',
  travail_sol: 'Travail du sol',
  semis: 'Semis',
  pulverisation: 'Pulvérisation',
  fenaison: 'Fenaison',
  elevage: 'Élevage',
  manutention: 'Manutention',
  remorque: 'Remorques',
  pieces: 'Pièces',
  pneus: 'Pneus',
  outillage: 'Outillage',
  autre: 'Autre',
};

export const LISTING_CONDITIONS = {
  neuf: 'Neuf',
  tres_bon: 'Très bon état',
  bon: 'Bon état',
  correct: 'État correct',
  pour_pieces: 'Pour pièces',
} as const;
export type ListingCondition = keyof typeof LISTING_CONDITIONS;

export const DELIVERY_LABELS = {
  envoi: 'Envoi par colis',
  main_propre: 'Remise en main propre',
  les_deux: 'Envoi ou main propre',
} as const;
export type ListingDelivery = keyof typeof DELIVERY_LABELS;

export const LISTING_STATUS = {
  brouillon: 'Brouillon',
  en_ligne: 'En ligne',
  reservee: 'Réservée',
  vendue: 'Vendue',
  retiree: 'Retirée',
  moderee: 'Retirée par la modération',
} as const;
export type ListingStatus = keyof typeof LISTING_STATUS;

export const REPORT_REASONS = {
  arnaque: 'Arnaque ou annonce suspecte',
  interdit: 'Objet interdit ou dangereux',
  doublon: 'Annonce en double',
  mauvaise_categorie: 'Mauvaise catégorie',
  deja_vendu: 'Déjà vendu',
  autre: 'Autre raison',
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

export const MAX_LISTING_PHOTOS = 8;
/** Poids maximal d'un colis (Colissimo, Mondial Relay : 30 kg ; au-delà, main propre). */
export const MAX_PARCEL_KG = 30;

/** Département d'après le code postal (Corse : 2A / 2B, outre-mer : 971 à 976). */
export function departmentOf(postalCode: string) {
  const cp = postalCode.trim();
  if (!/^\d{5}$/.test(cp)) return null;
  if (cp.startsWith('97')) return cp.slice(0, 3);
  if (cp.startsWith('20')) return Number(cp) < 20200 ? '2A' : '2B';
  return cp.slice(0, 2);
}

/** Adresse publique d'une annonce : /bourse/herse-rotative-kuhn-3-m-ab12cd34 */
export const listingPath = (l: { ref: string; title: string }) => `/bourse/${slugify(l.title).slice(0, 70)}-${l.ref}` as const;

/** Référence d'annonce extraite de l'adresse (8 derniers caractères). */
export function refFromSlug(slug: string) {
  const m = /([0-9a-f]{8})$/.exec(slug);
  return m ? m[1] : null;
}

export type ListingPhoto = { path: string; url: string; w?: number; h?: number };

/** Prix lisible : « 2 500 € ». */
export const priceLabel = (cents: number) =>
  (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });

/** Départements français (filtre de la bourse). */
export const DEPARTMENTS: Record<string, string> = {
  '01': 'Ain', '02': 'Aisne', '03': 'Allier', '04': 'Alpes-de-Haute-Provence', '05': 'Hautes-Alpes', '06': 'Alpes-Maritimes', '07': 'Ardèche', '08': 'Ardennes',
  '09': 'Ariège', '10': 'Aube', '11': 'Aude', '12': 'Aveyron', '13': 'Bouches-du-Rhône', '14': 'Calvados', '15': 'Cantal', '16': 'Charente', '17': 'Charente-Maritime',
  '18': 'Cher', '19': 'Corrèze', '2A': 'Corse-du-Sud', '2B': 'Haute-Corse', '21': 'Côte-d’Or', '22': 'Côtes-d’Armor', '23': 'Creuse', '24': 'Dordogne', '25': 'Doubs',
  '26': 'Drôme', '27': 'Eure', '28': 'Eure-et-Loir', '29': 'Finistère', '30': 'Gard', '31': 'Haute-Garonne', '32': 'Gers', '33': 'Gironde', '34': 'Hérault',
  '35': 'Ille-et-Vilaine', '36': 'Indre', '37': 'Indre-et-Loire', '38': 'Isère', '39': 'Jura', '40': 'Landes', '41': 'Loir-et-Cher', '42': 'Loire', '43': 'Haute-Loire',
  '44': 'Loire-Atlantique', '45': 'Loiret', '46': 'Lot', '47': 'Lot-et-Garonne', '48': 'Lozère', '49': 'Maine-et-Loire', '50': 'Manche', '51': 'Marne',
  '52': 'Haute-Marne', '53': 'Mayenne', '54': 'Meurthe-et-Moselle', '55': 'Meuse', '56': 'Morbihan', '57': 'Moselle', '58': 'Nièvre', '59': 'Nord', '60': 'Oise',
  '61': 'Orne', '62': 'Pas-de-Calais', '63': 'Puy-de-Dôme', '64': 'Pyrénées-Atlantiques', '65': 'Hautes-Pyrénées', '66': 'Pyrénées-Orientales', '67': 'Bas-Rhin',
  '68': 'Haut-Rhin', '69': 'Rhône', '70': 'Haute-Saône', '71': 'Saône-et-Loire', '72': 'Sarthe', '73': 'Savoie', '74': 'Haute-Savoie', '75': 'Paris',
  '76': 'Seine-Maritime', '77': 'Seine-et-Marne', '78': 'Yvelines', '79': 'Deux-Sèvres', '80': 'Somme', '81': 'Tarn', '82': 'Tarn-et-Garonne', '83': 'Var',
  '84': 'Vaucluse', '85': 'Vendée', '86': 'Vienne', '87': 'Haute-Vienne', '88': 'Vosges', '89': 'Yonne', '90': 'Territoire de Belfort', '91': 'Essonne',
  '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis', '94': 'Val-de-Marne', '95': 'Val-d’Oise', '971': 'Guadeloupe', '972': 'Martinique', '973': 'Guyane',
  '974': 'La Réunion', '976': 'Mayotte',
};
