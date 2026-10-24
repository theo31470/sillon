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
