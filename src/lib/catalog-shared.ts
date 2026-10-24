// Types et constantes du catalogue, utilisables côté serveur comme côté navigateur.

export const CATALOG_STATUSES = {
  todo: 'À générer',
  queued: 'En file d’attente',
  researching: 'Recherche en cours',
  researched: 'Recherche faite',
  writing: 'Rédaction en cours',
  done: 'Fiche créée',
  error: 'Erreur',
} as const;
export type CatalogStatus = keyof typeof CATALOG_STATUSES;

export type CatalogModel = {
  created_by: string | null;
  id: string;
  brand: string;
  series: string;
  model: string;
  years: string;
  power_hp: number | null;
  source_url: string | null;
  status: CatalogStatus;
  error: string | null;
  research_notes: string | null;
  research_sources: { name: string; url: string }[];
  sheet_id: string | null;
  attempts: number;
  queued_at: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Plafond de recherches web par jour (garde-fou de dépense), modifiable par variable d'environnement. */
export const CATALOG_DAILY_LIMIT = Number(process.env.CATALOG_DAILY_LIMIT) || 150;

/** Nombre d'étapes traitées en parallèle par la file. */
export const CATALOG_PARALLEL = 3;

/** Marques proposées dans l'écran d'import (saisie libre possible). */
export const TRACTOR_BRANDS: { name: string; note?: string }[] = [
  { name: 'John Deere' },
  { name: 'Fendt' },
  { name: 'Massey Ferguson' },
  { name: 'Valtra' },
  { name: 'Claas' },
  { name: 'Renault', note: 'Tracteurs Renault Agriculture, repris par Claas (2003-2008)' },
  { name: 'New Holland' },
  { name: 'Fiat', note: 'Fiat, puis Fiatagri, devenu New Holland' },
  { name: 'Case IH' },
  { name: 'International Harvester', note: 'Ancêtre de Case IH' },
  { name: 'Steyr' },
  { name: 'Deutz-Fahr' },
  { name: 'Same' },
  { name: 'Lamborghini' },
  { name: 'Hürlimann' },
  { name: 'Kubota' },
  { name: 'McCormick' },
  { name: 'Landini' },
  { name: 'Valpadana' },
  { name: 'Zetor' },
  { name: 'JCB' },
  { name: 'Antonio Carraro' },
  { name: 'Lindner' },
  { name: 'Kioti' },
  { name: 'Ford', note: 'Ford tracteurs, devenu New Holland en 1991' },
  { name: 'Belarus' },
];
