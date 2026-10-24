// Types des lignes de la base (voir supabase/migrations).

export type Plan = 'free' | 'complet' | 'groupement';

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  farm_name: string;
  role: 'member' | 'admin';
  plan: Plan;
  stripe_customer_id: string | null;
  suspended: boolean;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
};

export type Parcel = {
  id: string;
  user_id: string;
  name: string;
  crop: string;
  area_ha: number;
  created_at: string;
};

export const INTERVENTION_KINDS = {
  semis: 'Semis',
  traitement: 'Traitement',
  fertilisation: 'Fertilisation',
  travail_sol: 'Travail du sol',
  recolte: 'Récolte',
  autre: 'Autre',
} as const;
export type InterventionKind = keyof typeof INTERVENTION_KINDS;

export type Intervention = {
  id: string;
  user_id: string;
  parcel_id: string;
  done_on: string;
  kind: InterventionKind;
  product: string;
  dose: number | null;
  dose_unit: string;
  target: string;
  operator: string;
  notes: string;
  created_at: string;
};

export type Machine = {
  id: string;
  user_id: string;
  name: string;
  sheet_id: string | null;
  hours: number;
  created_at: string;
};

export type MaintenanceLog = {
  id: string;
  machine_id: string;
  operation: string;
  done_at_hours: number;
  done_on: string;
  notes: string;
};

export const SHEET_CATEGORIES = {
  machine: 'Matériel',
  culture: 'Cultures',
  produit: 'Produits',
  panne: 'Pannes',
} as const;
export type SheetCategory = keyof typeof SHEET_CATEGORIES;

export const SHEET_STATUSES = {
  generating: 'En génération',
  review: 'À relire',
  validated: 'Validée',
  published: 'Publiée',
  rejected: 'Rejetée',
} as const;
export type SheetStatus = keyof typeof SHEET_STATUSES;

/** Document PDF déposé (path) ou page web consultée par Claude (url). */
export type SheetSource = { name: string; path?: string; url?: string };

/** Crédit d'une photo : obligatoire pour toute photo publiée. */
export type PhotoCredit = {
  source: 'commons' | 'manual';
  author: string;
  license: string;
  license_url: string | null;
  source_url: string | null;
  title?: string | null;
};

export type TechSheet = {
  id: string;
  slug: string;
  title: string;
  category: SheetCategory;
  brand: string;
  model: string;
  summary: string;
  cover_url: string | null;
  cover_credit: PhotoCredit | null;
  content: unknown;
  sources: SheetSource[];
  status: SheetStatus;
  ai_model: string | null;
  validated_by: string | null;
  validated_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export const BLOG_CATEGORIES = {
  reglementation: 'Réglementation',
  materiel: 'Matériel',
  'meteo-cultures': 'Météo & cultures',
  gestion: 'Gestion',
} as const;
export type BlogCategory = keyof typeof BLOG_CATEGORIES;

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content_md: string;
  category: BlogCategory;
  cover_url: string | null;
  author_name: string;
  seo_description: string;
  status: 'draft' | 'scheduled' | 'published';
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Subscription = {
  id: string;
  user_id: string;
  status: string;
  plan: Plan;
  price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type Payment = {
  id: string;
  user_id: string | null;
  amount_cents: number;
  currency: string;
  status: 'paid' | 'failed' | 'refunded';
  failure_reason: string | null;
  attempt_count: number;
  hosted_invoice_url: string | null;
  created_at: string;
};

export type AuditEntry = {
  id: number;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  created_at: string;
};
