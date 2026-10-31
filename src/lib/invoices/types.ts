/** Factures et avoirs émis par Tracteurs & Co (table `invoices`, voir la migration 20261031000100). */

export type InvoiceKind = 'facture' | 'avoir';

/** Copie figée de l'acheteur au moment de l'émission. */
export type InvoiceCustomer = {
  name: string;
  email: string;
  line1: string;
  line2: string;
  postal_code: string;
  city: string;
  country: string;
  siret: string;
  vat_number: string;
};

export type InvoiceLine = {
  label: string;
  /** Précision sous l'intitulé : période, formule… */
  detail?: string;
  quantity: number;
  unit_cents: number;
  /** Peut être négatif : remise, ajustement au prorata. */
  total_cents: number;
};

export type InvoiceRow = {
  id: string;
  number: string;
  kind: InvoiceKind;
  user_id: string | null;
  stripe_invoice_id: string | null;
  stripe_refund_id: string | null;
  credited_invoice_id: string | null;
  issued_at: string;
  paid_at: string | null;
  customer: InvoiceCustomer;
  lines: InvoiceLine[];
  total_cents: number;
  currency: string;
  payment_method: string;
};

/** Montant au format français : « 1 234,50 € ». */
export function formatCents(cents: number, currency = 'eur') {
  const symbol = currency.toLowerCase() === 'eur' ? '€' : currency.toUpperCase();
  const negative = cents < 0;
  const [int, dec] = (Math.abs(cents) / 100).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${negative ? '−' : ''}${grouped},${dec} ${symbol}`;
}

/** Date au format « 31 octobre 2026 », heure de Paris. */
export function frenchDate(iso: string | number | Date | null | undefined) {
  if (iso === null || iso === undefined) return '';
  const d = typeof iso === 'number' ? new Date(iso * 1000) : new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
}

export const COUNTRY_NAMES: Record<string, string> = {
  FR: 'France',
  BE: 'Belgique',
  CH: 'Suisse',
  LU: 'Luxembourg',
  DE: 'Allemagne',
  ES: 'Espagne',
  IT: 'Italie',
};
