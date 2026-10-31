import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { SITE } from '@/lib/site';
import { INVOICE_LOGO_PNG_BASE64, INVOICE_LOGO_RATIO } from './logo';
import { COUNTRY_NAMES, formatCents, frenchDate, type InvoiceRow } from './types';

/**
 * Facture ou avoir au format PDF (A4), à l'identité Tracteurs & Co.
 * Généré à la demande depuis la copie figée en base : le document est
 * identique à chaque téléchargement.
 *
 * Mentions obligatoires (micro-entreprise) : identité et SIRET du vendeur,
 * numéro unique, date d'émission, date de la prestation, identité de
 * l'acheteur, désignation, prix, mention « TVA non applicable, art. 293 B du
 * CGI », pénalités de retard et indemnité forfaitaire de 40 € (clients professionnels).
 */

const INK = rgb(0.106, 0.098, 0.086); // #1B1916
const MUTED = rgb(0.42, 0.39, 0.345); // #6B6358
const LINE = rgb(0.898, 0.875, 0.839); // #E5DFD6
const SOFT = rgb(0.98, 0.973, 0.957); // #FAF8F4
const BRAND = rgb(0.878, 0.529, 0.353); // #E0875A

const A4 = { w: 595.28, h: 841.89 };
const M = 48; // marge

type Fonts = { regular: PDFFont; bold: PDFFont };

/** Les polices standard du PDF ne couvrent que l'alphabet latin (WinAnsi) : on remplace le reste. */
function makeSanitizer(font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  const map: Record<string, string> = { ' ': ' ', ' ': ' ', '−': '-', '‑': '-', '‐': '-', '→': '->', '…': '...' };
  return (text: string) =>
    Array.from(text.normalize('NFC'))
      .map((ch) => map[ch] ?? (supported.has(ch.codePointAt(0)!) ? ch : '?'))
      .join('');
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !current) current = next;
    else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function renderInvoicePdf(inv: InvoiceRow, opts: { creditedNumber?: string } = {}) {
  const doc = await PDFDocument.create();
  const isCredit = inv.kind === 'avoir';
  doc.setTitle(`${isCredit ? 'Avoir' : 'Facture'} ${inv.number} - ${SITE.name}`);
  doc.setAuthor(SITE.name);
  doc.setCreator(SITE.name);
  doc.setProducer(SITE.name);
  doc.setLanguage('fr-FR');
  doc.setCreationDate(new Date(inv.issued_at));
  doc.setModificationDate(new Date(inv.issued_at));

  const fonts: Fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const clean = makeSanitizer(fonts.regular);
  const page = doc.addPage([A4.w, A4.h]);

  const text = (p: PDFPage, s: string, x: number, y: number, size = 9.5, opt: { bold?: boolean; color?: ReturnType<typeof rgb>; align?: 'left' | 'right' } = {}) => {
    const font = opt.bold ? fonts.bold : fonts.regular;
    const str = clean(s);
    const dx = opt.align === 'right' ? font.widthOfTextAtSize(str, size) : 0;
    p.drawText(str, { x: x - dx, y, size, font, color: opt.color ?? INK });
  };

  // En-tête : logo à gauche, type et numéro à droite.
  const logo = await doc.embedPng(Buffer.from(INVOICE_LOGO_PNG_BASE64, 'base64'));
  const logoW = 170;
  page.drawImage(logo, { x: M, y: A4.h - M - logoW / INVOICE_LOGO_RATIO, width: logoW, height: logoW / INVOICE_LOGO_RATIO });
  const right = A4.w - M;
  let y = A4.h - M - 14;
  text(page, isCredit ? 'AVOIR' : 'FACTURE', right, y, 20, { bold: true, align: 'right' });
  y -= 18;
  text(page, `N° ${inv.number}`, right, y, 11, { bold: true, align: 'right', color: BRAND });
  y -= 14;
  text(page, `Date d'émission : ${frenchDate(inv.issued_at)}`, right, y, 9.5, { align: 'right', color: MUTED });
  if (isCredit && opts.creditedNumber) {
    y -= 12;
    text(page, `Sur la facture n° ${opts.creditedNumber}`, right, y, 9.5, { align: 'right', color: MUTED });
  }

  // Vendeur et acheteur.
  const top = A4.h - M - 92;
  const colW = (A4.w - 2 * M - 20) / 2;
  const block = (title: string, rows: { s: string; bold?: boolean }[], x: number, boxed: boolean) => {
    const lineH = 12.5;
    const h = 22 + rows.length * lineH + 8;
    if (boxed) page.drawRectangle({ x, y: top - h, width: colW, height: h, color: SOFT, borderColor: LINE, borderWidth: 0.8 });
    const px = x + (boxed ? 12 : 0);
    let yy = top - 16;
    text(page, title.toUpperCase(), px, yy, 7.5, { bold: true, color: MUTED });
    yy -= 15;
    for (const r of rows) {
      for (const l of wrap(clean(r.s), r.bold ? fonts.bold : fonts.regular, 9.5, colW - (boxed ? 24 : 0))) {
        text(page, l, px, yy, 9.5, { bold: r.bold });
        yy -= lineH;
      }
    }
    return h;
  };
  const sellerRows = [
    { s: SITE.name, bold: true },
    { s: `${SITE.editor.name}, entrepreneur individuel` },
    { s: SITE.editor.address },
    { s: `SIRET ${SITE.editor.siret}` },
    { s: SITE.contactEmail },
  ];
  const c = inv.customer;
  const cityLine = [c.postal_code, c.city].filter(Boolean).join(' ');
  const buyerRows = [
    { s: c.name || c.email, bold: true },
    ...(c.line1 ? [{ s: c.line1 }] : []),
    ...(c.line2 ? [{ s: c.line2 }] : []),
    ...(cityLine ? [{ s: cityLine }] : []),
    ...(c.country && c.country !== 'FR' ? [{ s: COUNTRY_NAMES[c.country] ?? c.country }] : []),
    ...(c.siret ? [{ s: `SIRET ${c.siret.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4')}` }] : []),
    ...(c.vat_number ? [{ s: `N° TVA ${c.vat_number}` }] : []),
    ...(c.email && c.name ? [{ s: c.email }] : []),
  ];
  const hA = block('Émetteur', sellerRows, M, false);
  const hB = block(isCredit ? 'Avoir au profit de' : 'Facturé à', buyerRows, M + colW + 20, true);
  y = top - Math.max(hA, hB) - 26;

  // Tableau des lignes.
  const cols = { label: M, qty: A4.w - M - 190, unit: A4.w - M - 95, total: right };
  page.drawRectangle({ x: M, y: y - 6, width: A4.w - 2 * M, height: 22, color: INK });
  text(page, 'Désignation', cols.label + 10, y + 1, 8.5, { bold: true, color: rgb(1, 1, 1) });
  text(page, 'Qté', cols.qty, y + 1, 8.5, { bold: true, color: rgb(1, 1, 1), align: 'right' });
  text(page, 'Prix unitaire', cols.unit, y + 1, 8.5, { bold: true, color: rgb(1, 1, 1), align: 'right' });
  text(page, 'Montant', cols.total - 10, y + 1, 8.5, { bold: true, color: rgb(1, 1, 1), align: 'right' });
  y -= 26;
  const labelW = cols.qty - cols.label - 60;
  for (const l of inv.lines) {
    const labelLines = wrap(clean(l.label), fonts.bold, 9.5, labelW);
    const detailLines = l.detail ? wrap(clean(l.detail), fonts.regular, 8.5, labelW) : [];
    const rowTop = y;
    labelLines.forEach((s, i) => text(page, s, cols.label + 10, y - i * 12, 9.5, { bold: true }));
    let yy = y - labelLines.length * 12;
    detailLines.forEach((s) => {
      text(page, s, cols.label + 10, yy, 8.5, { color: MUTED });
      yy -= 11;
    });
    text(page, String(l.quantity), cols.qty, rowTop, 9.5, { align: 'right' });
    text(page, formatCents(l.unit_cents, inv.currency), cols.unit, rowTop, 9.5, { align: 'right' });
    text(page, formatCents(l.total_cents, inv.currency), cols.total - 10, rowTop, 9.5, { align: 'right', bold: true });
    y = yy - 8;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: right, y: y + 4 }, thickness: 0.6, color: LINE });
    y -= 10;
  }

  // Totaux.
  const totX = A4.w - M - 230;
  const totalRow = (label: string, value: string, opt: { bold?: boolean; size?: number } = {}) => {
    text(page, label, totX, y, opt.size ?? 9.5, { bold: opt.bold, color: opt.bold ? INK : MUTED });
    text(page, value, right - 10, y, opt.size ?? 9.5, { bold: opt.bold, align: 'right' });
    y -= (opt.size ?? 9.5) + 7;
  };
  y -= 4;
  totalRow('Total HT', formatCents(inv.total_cents, inv.currency));
  totalRow('TVA', 'Non applicable');
  y -= 10;
  page.drawRectangle({ x: totX - 10, y: y - 9, width: right - totX + 10, height: 27, color: SOFT, borderColor: LINE, borderWidth: 0.8 });
  totalRow(isCredit ? 'Montant remboursé' : 'Total TTC', formatCents(inv.total_cents, inv.currency), { bold: true, size: 11.5 });
  y -= 6;
  text(page, SITE.vatMention, right - 10, y, 8.5, { align: 'right', color: MUTED });
  y -= 30;

  // Règlement.
  text(page, isCredit ? 'REMBOURSEMENT' : 'RÈGLEMENT', M, y, 7.5, { bold: true, color: MUTED });
  y -= 14;
  const paid = inv.paid_at ? frenchDate(inv.paid_at) : frenchDate(inv.issued_at);
  const settlement = isCredit
    ? `Remboursé le ${paid}${inv.payment_method ? ` ${inv.payment_method}` : ' sur le moyen de paiement d\'origine'}.`
    : `Payée le ${paid}${inv.payment_method ? ` par ${inv.payment_method}` : ''}. Reste à payer : ${formatCents(0, inv.currency)}.`;
  for (const l of wrap(clean(settlement), fonts.regular, 9.5, A4.w - 2 * M)) {
    text(page, l, M, y);
    y -= 12.5;
  }

  // Pied de page : mentions légales.
  const legal = [
    'Pénalités de retard : trois fois le taux d\'intérêt légal. Indemnité forfaitaire pour frais de recouvrement : 40 € (clients professionnels). Pas d\'escompte pour paiement anticipé.',
    `${SITE.name} - ${SITE.editor.name}, entrepreneur individuel - SIRET ${SITE.editor.siret} - ${SITE.editor.address} - ${SITE.vatMention}.`,
  ];
  let fy = M + 22;
  page.drawLine({ start: { x: M, y: fy + 18 }, end: { x: right, y: fy + 18 }, thickness: 0.6, color: LINE });
  for (const para of legal) {
    for (const l of wrap(clean(para), fonts.regular, 7.5, A4.w - 2 * M)) {
      text(page, l, M, fy, 7.5, { color: MUTED });
      fy -= 10;
    }
  }

  return doc.save();
}
