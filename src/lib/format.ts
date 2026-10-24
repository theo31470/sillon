/** Utilitaires de formatage (dates, nombres, montants) en français. */

export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris', ...opts }).format(d);
}

export function formatNumber(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(value);
}

export function formatEuros(cents: number, currency = 'eur') {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

/** Transforme un titre en adresse de page : « Gel de printemps ! » → « gel-de-printemps ». */
export function slugify(input: string) {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Masque une adresse e-mail : jean.martin@exemple.fr → je•••@ex•••.fr */
export function maskEmail(email: string) {
  const [user, domain = ''] = email.split('@');
  const [host, ...tld] = domain.split('.');
  return `${user.slice(0, 2)}•••@${host.slice(0, 2)}•••.${tld.join('.') || '?'}`;
}

/**
 * Convertit une date « 2026-10-27T07:00 » saisie dans un champ datetime-local
 * (heure de Paris) en instant UTC, quel que soit le fuseau du serveur.
 */
export function parisLocalToDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const asUtc = new Date(`${value.slice(0, 16)}:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(asUtc);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const parisAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  const offset = parisAsUtc - asUtc.getTime();
  return new Date(asUtc.getTime() - offset);
}

/** Date ISO d'il y a `days` jours (pour les filtres « 30 derniers jours »). */
export function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** Nombre de semaines écoulées depuis une date (0 = cette semaine). */
export function weeksAgo(date: string) {
  return Math.floor((Date.now() - new Date(date).getTime()) / (7 * 86_400_000));
}
