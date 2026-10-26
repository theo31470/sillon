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
  /** Rappels d'entretien par e-mail. */
  email_reminders: boolean;
  /** Annonces et nouveautés envoyées depuis l'admin. */
  email_news: boolean;
  /** Jeton des liens « se désinscrire » (ne permet que de changer ces deux préférences). */
  email_token: string;
  /** Formule Complet offerte par un admin, hors Stripe. */
  comp_active: boolean;
  /** Fin de la formule offerte (null : sans date de fin). */
  comp_until: string | null;
  /** Dernière activité (connexion ou visite de l'espace membre). */
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export const MACHINE_KINDS = {
  tracteur: 'Tracteur',
  moissonneuse: 'Moissonneuse-batteuse',
  telescopique: 'Chargeur télescopique',
  pulverisateur: 'Pulvérisateur',
  automoteur: 'Automoteur (ensileuse, vendangeuse…)',
  outil: 'Outil attelé',
  autre: 'Autre',
} as const;
export type MachineKindDb = keyof typeof MACHINE_KINDS;

export type Machine = {
  id: string;
  user_id: string;
  name: string;
  sheet_id: string | null;
  hours: number;
  kind: MachineKindDb;
  brand: string;
  model: string;
  year: number | null;
  serial_number: string;
  registration: string;
  purchase_date: string | null;
  purchase_price: number | null;
  resale_value: number | null;
  depreciation_years: number;
  interest_rate: number;
  annual_hours_estimate: number | null;
  billing_rate: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type MaintenanceLog = {
  id: string;
  machine_id: string;
  operation: string;
  done_at_hours: number;
  done_on: string;
  notes: string;
  cost_id: string | null;
};

export type HourReading = {
  id: string;
  machine_id: string;
  hours: number;
  read_on: string;
  created_at: string;
};

export const COST_KINDS = {
  carburant: 'Carburant',
  entretien: 'Entretien',
  reparation: 'Réparation',
  pneumatiques: 'Pneumatiques',
  assurance: 'Assurance',
  autre: 'Autre',
} as const;
export type CostKind = keyof typeof COST_KINDS;

export type MachineCost = {
  id: string;
  machine_id: string;
  kind: CostKind;
  label: string;
  amount: number;
  liters: number | null;
  hours_at: number | null;
  spent_on: string;
  created_at: string;
};

export type MachineTask = {
  id: string;
  machine_id: string;
  operation: string;
  interval_hours: number | null;
  interval_months: number | null;
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
  /** Précision affichée sous la photo (ex. photo d'un autre modèle de la même série). */
  note?: string | null;
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
  entretien: 'Entretien & réparation',
  gestion: 'Coûts & gestion',
  occasion: 'Achat & revente',
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

/** Fiche d'administration d'un membre (lisible des seuls admins). */
export type MemberAdmin = {
  user_id: string;
  note: string;
  tags: string[];
  /** Quota mensuel de diagnostics propre à ce membre (null : quota par défaut). */
  diag_monthly_limit: number | null;
  updated_at: string;
  updated_by: string | null;
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
