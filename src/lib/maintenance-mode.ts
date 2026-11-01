/**
 * Mode maintenance : tout le site public et l'espace membre affichent la page
 * /maintenance (code 503), sauf pour les administrateurs. Les routes API (webhook
 * Stripe, tâches planifiées) continuent de fonctionner.
 * Utilisable par le proxy comme par les pages.
 */

export type MaintenanceState = {
  active: boolean;
  /** Message affiché aux visiteurs (facultatif). */
  message: string;
  /** Retour prévu (ISO), facultatif. */
  until: string | null;
};

export const MAINTENANCE_OFF: MaintenanceState = { active: false, message: '', until: null };

export function parseMaintenance(value: unknown): MaintenanceState {
  if (!value || typeof value !== 'object') return MAINTENANCE_OFF;
  const v = value as Record<string, unknown>;
  const until = typeof v.until === 'string' && !Number.isNaN(Date.parse(v.until)) ? v.until : null;
  return { active: v.active === true, message: typeof v.message === 'string' ? v.message.slice(0, 400) : '', until };
}

/** Chemins toujours accessibles pendant la maintenance (connexion des admins, page elle-même). */
export function bypassesMaintenance(path: string) {
  return (
    path === '/maintenance' ||
    path.startsWith('/connexion') ||
    path.startsWith('/securite') ||
    path.startsWith('/auth/') ||
    path.startsWith('/mot-de-passe-oublie') ||
    path === '/robots.txt' ||
    path === '/manifest.webmanifest' ||
    path.startsWith('/icon') ||
    path.startsWith('/apple-icon')
  );
}
