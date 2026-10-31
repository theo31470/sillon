import 'server-only';
import { PDFDocument, rgb, type PDFFont, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { SITE } from '@/lib/site';
import { BARLOW_400_WOFF, BARLOW_500_WOFF, BARLOW_700_WOFF, BARLOW_800_WOFF, EMBLEM_PNG, LOGO_RATIO, LOGO_WHITE_PNG } from './assets';
import { COUNTRY_NAMES, formatCents, frenchDate, type InvoiceRow } from './types';

/**
 * Facture ou avoir au format PDF (A4), à l'identité Tracteurs & Co :
 * bandeau sombre, accents terre cuite, typographie Barlow (celle du site), mise en page sobre.
 * Généré à la demande depuis la copie figée en base : identique à chaque téléchargement.
 *
 * Mentions obligatoires (micro-entreprise) : identité et SIRET du vendeur, numéro unique,
 * date d'émission, date de la prestation, identité de l'acheteur, désignation, prix,
 * « TVA non applicable, art. 293 B du CGI », pénalités de retard et indemnité de 40 €.
 */

const C = {
  ink: rgb(0.106, 0.098, 0.086), // #1B1916
  muted: rgb(0.42, 0.39, 0.345), // #6B6358
  line: rgb(0.898, 0.875, 0.839), // #E5DFD6
  brand: rgb(0.878, 0.529, 0.353), // #E0875A
  brandDark: rgb(0.698, 0.353, 0.18), // #B25A2E
  white: rgb(1, 1, 1),
};

const W = 595.28;
const H = 841.89;
const M = 44;

type Fonts = { regular: PDFFont; medium: PDFFont; bold: PDFFont; black: PDFFont };
type TextOpt = { font?: PDFFont; size?: number; color?: RGB; align?: 'left' | 'right' | 'center'; opacity?: number };

/** Remplace les caractères absents de la police (espaces fines, flèches…). */
function makeSanitizer(font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  const map: Record<string, string> = { ' ': ' ', ' ': ' ', '−': '-', '‑': '-', '→': '->' };
  return (text: string) =>
    Array.from(text.normalize('NFC'))
      .map((ch) => (supported.has(ch.codePointAt(0)!) ? ch : map[ch] && supported.has(map[ch].codePointAt(0)!) ? map[ch] : map[ch] ?? '?'))
      .join('');
}

const MONTHS: Record<string, string> = { janvier: 'janv.', février: 'févr.', septembre: 'sept.', octobre: 'oct.', novembre: 'nov.', décembre: 'déc.', juillet: 'juil.' };
/** « 30 novembre 2026 » → « 30 nov. 2026 » (cases étroites du bandeau d'informations). */
const short = (s: string) => s.replace(/\b(janvier|février|septembre|octobre|novembre|décembre|juillet)\b/g, (m) => MONTHS[m]);

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  let current = '';
  // Les espaces insécables (ex. « •••• 4242 ») ne coupent pas la ligne.
  for (const w of text.split(/[ \t\n]+/).filter(Boolean)) {
    const next = current ? `${current} ${w}` : w;
    if (!current || font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
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
  doc.registerFontkit(fontkit);
  const isCredit = inv.kind === 'avoir';
  const title = isCredit ? 'Avoir' : 'Facture';
  doc.setTitle(`${title} ${inv.number} - ${SITE.name}`);
  doc.setAuthor(SITE.name);
  doc.setCreator(SITE.name);
  doc.setProducer(SITE.name);
  doc.setLanguage('fr-FR');
  doc.setCreationDate(new Date(inv.issued_at));
  doc.setModificationDate(new Date(inv.issued_at));

  const font = (b64: string) => doc.embedFont(Buffer.from(b64, 'base64'), { subset: true });
  const f: Fonts = { regular: await font(BARLOW_400_WOFF), medium: await font(BARLOW_500_WOFF), bold: await font(BARLOW_700_WOFF), black: await font(BARLOW_800_WOFF) };
  const clean = makeSanitizer(f.regular);
  const page = doc.addPage([W, H]);

  const text = (s: string, x: number, y: number, o: TextOpt = {}) => {
    const fnt = o.font ?? f.regular;
    const size = o.size ?? 9.5;
    const str = clean(s);
    const width = fnt.widthOfTextAtSize(str, size);
    const dx = o.align === 'right' ? width : o.align === 'center' ? width / 2 : 0;
    page.drawText(str, { x: x - dx, y, size, font: fnt, color: o.color ?? C.ink, opacity: o.opacity });
    return width;
  };
  const label = (s: string, x: number, y: number, o: TextOpt = {}) => text(s.toUpperCase(), x, y, { font: f.bold, size: 7.5, color: C.muted, ...o });

  const logoWhite = await doc.embedPng(Buffer.from(LOGO_WHITE_PNG, 'base64'));
  const emblem = await doc.embedPng(Buffer.from(EMBLEM_PNG, 'base64'));

  // ── Bandeau ────────────────────────────────────────────────────────────
  const bandH = 118;
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: C.ink });
  // Sillons : lignes de labour en perspective, discrètes.
  for (let i = 0; i < 9; i++) {
    const x0 = W * 0.42 + i * 34;
    page.drawSvgPath(`M ${x0} ${bandH} C ${x0 + 40} ${bandH * 0.55} ${x0 + 120} ${bandH * 0.2} ${x0 + 230} 0`, {
      x: 0,
      y: H,
      borderColor: C.white,
      borderWidth: 1.4,
      borderOpacity: 0.12,
    });
  }
  page.drawRectangle({ x: 0, y: H - bandH - 3, width: W, height: 3, color: C.brand });
  const logoW = 176;
  page.drawImage(logoWhite, { x: M, y: H - bandH / 2 - logoW / LOGO_RATIO / 2 + 2, width: logoW, height: logoW / LOGO_RATIO });
  text(title.toUpperCase(), W - M, H - 56, { font: f.black, size: 28, color: C.white, align: 'right' });
  text(`N° ${inv.number}`, W - M, H - 76, { font: f.bold, size: 12, color: C.brand, align: 'right' });

  // ── En-tête du document : parties à gauche, dates à droite ────────────
  let y = H - bandH - 3 - 34;
  const c = inv.customer;
  const cityLine = [c.postal_code, c.city].filter(Boolean).join(' ');
  const buyer = [
    ...(c.line1 ? [c.line1] : []),
    ...(c.line2 ? [c.line2] : []),
    ...(cityLine ? [cityLine] : []),
    ...(c.country && c.country !== 'FR' ? [COUNTRY_NAMES[c.country] ?? c.country] : []),
    ...(c.siret ? [`SIRET ${c.siret.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4')}`] : []),
    ...(c.vat_number ? [`N° TVA ${c.vat_number}`] : []),
    ...(c.email && c.name ? [c.email] : []),
  ];
  const seller = [`${SITE.editor.name}, entrepreneur individuel`, SITE.editor.address, `SIRET ${SITE.editor.siret}`, SITE.contactEmail];
  const colW = 175;

  const party = (title: string, name: string, rows: string[], x: number) => {
    label(title, x, y);
    const names = wrap(clean(name), f.bold, 11.5, colW);
    names.forEach((n, i) => text(n, x, y - 17 - i * 13.5, { font: f.bold, size: 11.5 }));
    rows.forEach((r, i) => text(r, x, y - 31 - (names.length - 1) * 13.5 - i * 12.5, { size: 9.5, color: C.muted }));
    return 31 + (names.length - 1) * 13.5 + rows.length * 12.5;
  };
  const hSeller = party('Émetteur', SITE.name, seller, M);
  const hBuyer = party(isCredit ? 'Au profit de' : 'Facturé à', c.name || c.email, buyer, M + colW + 24);

  // Dates, alignées à droite.
  const period = short((inv.lines[0]?.detail ?? '').replace(/^Période du /i, ''));
  const facts: [string, string][] = isCredit
    ? [
        ['Date d’émission', frenchDate(inv.issued_at)],
        ['Date de remboursement', frenchDate(inv.paid_at ?? inv.issued_at)],
        ['Facture d’origine', opts.creditedNumber ?? '—'],
      ]
    : [
        ['Date d’émission', frenchDate(inv.issued_at)],
        ['Date de paiement', frenchDate(inv.paid_at ?? inv.issued_at)],
        ...(period ? ([['Période', period]] as [string, string][]) : []),
      ];
  facts.forEach(([k, v], i) => {
    label(k, W - M, y - i * 30, { align: 'right' });
    text(v, W - M, y - 14 - i * 30, { font: f.medium, size: 10, align: 'right' });
  });
  y -= Math.max(hSeller, hBuyer, facts.length * 30 - 6) + 34;

  // ── Lignes ─────────────────────────────────────────────────────────────
  const col = { qty: W - M - 180, unit: W - M - 92, total: W - M };
  label('Désignation', M, y);
  label('Qté', col.qty, y, { align: 'right' });
  label('Prix unitaire', col.unit, y, { align: 'right' });
  label('Montant', col.total, y, { align: 'right' });
  y -= 9;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: C.ink });
  y -= 18;
  const labelW = col.qty - M - 50;
  for (const l of inv.lines) {
    const top = y;
    const ls = wrap(clean(l.label), f.bold, 10.5, labelW);
    ls.forEach((s, i) => text(s, M, y - i * 13, { font: f.bold, size: 10.5 }));
    y -= ls.length * 13;
    if (l.detail) {
      for (const d of wrap(clean(l.detail), f.regular, 9, labelW)) {
        text(d, M, y + 1, { size: 9, color: C.muted });
        y -= 11.5;
      }
    }
    text(String(l.quantity), col.qty, top, { font: f.medium, size: 10, align: 'right' });
    text(formatCents(l.unit_cents, inv.currency), col.unit, top, { font: f.medium, size: 10, align: 'right' });
    text(formatCents(l.total_cents, inv.currency), col.total, top, { font: f.bold, size: 10.5, align: 'right' });
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: C.line });
    y -= 20;
  }

  // ── Totaux (à droite) ─────────────────────────────────────────────────
  const tx = W - M - 200;
  const totalsTop = y;
  const row = (k: string, v: string) => {
    text(k, tx, y, { size: 9.5, color: C.muted });
    text(v, W - M, y, { font: f.medium, size: 9.5, align: 'right' });
    y -= 17;
  };
  row('Total HT', formatCents(inv.total_cents, inv.currency));
  row('TVA', 'Non applicable');
  y += 4;
  page.drawLine({ start: { x: tx, y }, end: { x: W - M, y }, thickness: 1.2, color: C.ink });
  y -= 22;
  text(isCredit ? 'Montant remboursé' : 'Total TTC', tx, y + 2, { font: f.bold, size: 11 });
  text(formatCents(inv.total_cents, inv.currency), W - M, y, { font: f.black, size: 18, color: C.brandDark, align: 'right' });
  y -= 18;
  text(SITE.vatMention, W - M, y, { size: 8, color: C.muted, align: 'right' });

  // ── Règlement et mot de fin (à gauche) ────────────────────────────────
  const lw = tx - M - 40;
  let ly = totalsTop;
  const pm = (inv.payment_method || '').replace(/ (\d{4})$/, ' $1');
  const when = frenchDate(inv.paid_at ?? inv.issued_at);
  label(isCredit ? 'Remboursement' : 'Règlement', M, ly);
  ly -= 15;
  const settled = isCredit
    ? `Remboursé le ${when} ${pm || 'sur le moyen de paiement d’origine'}.`
    : inv.total_cents === 0
      ? `Montant entièrement couvert par la remise : rien à régler. Aucun montant restant dû.`
      : `Payée le ${when}${pm ? ` par ${pm}` : ''}. Aucun montant restant dû.`;
  for (const s of wrap(clean(settled), f.medium, 9.5, lw)) {
    text(s, M, ly, { font: f.medium, size: 9.5 });
    ly -= 12.5;
  }
  ly -= 14;
  text(isCredit ? 'Votre remboursement est en route.' : 'Merci pour votre confiance.', M, ly, { font: f.bold, size: 11.5 });
  ly -= 15;
  for (const s of wrap(clean(`Une question sur ce document ? Écrivez-nous à ${SITE.contactEmail} en rappelant son numéro.`), f.regular, 9, lw)) {
    text(s, M, ly, { size: 9, color: C.muted });
    ly -= 11.5;
  }

  // ── Pied de page ──────────────────────────────────────────────────────
  const fy = M + 46;
  page.drawLine({ start: { x: M, y: fy }, end: { x: W - M, y: fy }, thickness: 0.6, color: C.line });
  page.drawImage(emblem, { x: M, y: M - 6, width: 44, height: 44 });
  const legal = [
    `${SITE.name} - ${SITE.editor.name}, entrepreneur individuel - SIRET ${SITE.editor.siret} - ${SITE.editor.address}.`,
    `${SITE.vatMention}. Pénalités de retard : trois fois le taux d'intérêt légal. Indemnité forfaitaire pour frais de recouvrement : 40 € (clients professionnels). Pas d'escompte pour paiement anticipé.`,
  ];
  let ty = fy - 15;
  for (const para of legal) {
    for (const s of wrap(clean(para), f.regular, 7.5, W - 2 * M - 60)) {
      text(s, M + 58, ty, { size: 7.5, color: C.muted });
      ty -= 10;
    }
  }
  text(`${title} ${inv.number} - page 1/1`, W - M, M - 18, { size: 7, color: C.muted, align: 'right' });

  return doc.save();
}
