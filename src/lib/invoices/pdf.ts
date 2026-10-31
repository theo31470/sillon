import 'server-only';
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { SITE } from '@/lib/site';
import { BARLOW_400_WOFF, BARLOW_500_WOFF, BARLOW_700_WOFF, BARLOW_800_WOFF, EMBLEM_PNG, LOGO_RATIO, LOGO_WHITE_PNG } from './assets';
import { COUNTRY_NAMES, formatCents, frenchDate, type InvoiceRow } from './types';

/**
 * Facture ou avoir au format PDF (A4), à l'identité Tracteurs & Co :
 * bandeau sombre, accents terre cuite, typographie Barlow (celle du site).
 * Généré à la demande depuis la copie figée en base : identique à chaque téléchargement.
 *
 * Mentions obligatoires (micro-entreprise) : identité et SIRET du vendeur, numéro unique,
 * date d'émission, date de la prestation, identité de l'acheteur, désignation, prix,
 * « TVA non applicable, art. 293 B du CGI », pénalités de retard et indemnité de 40 €.
 */

const C = {
  ink: rgb(0.106, 0.098, 0.086), // #1B1916
  ink2: rgb(0.17, 0.157, 0.137), // bandeau, nuance
  muted: rgb(0.42, 0.39, 0.345), // #6B6358
  line: rgb(0.898, 0.875, 0.839), // #E5DFD6
  soft: rgb(0.98, 0.973, 0.957), // #FAF8F4
  brand: rgb(0.878, 0.529, 0.353), // #E0875A
  brandDark: rgb(0.698, 0.353, 0.18), // #B25A2E
  brandTint: rgb(0.984, 0.945, 0.918), // #FBF1EA
  green: rgb(0.204, 0.49, 0.325), // #347D53
  greenTint: rgb(0.906, 0.957, 0.925),
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

/** Rectangle aux coins arrondis ; (x, y) = coin bas gauche. */
function roundRect(page: PDFPage, x: number, y: number, w: number, h: number, r: number, opt: { fill?: RGB; stroke?: RGB; strokeWidth?: number; opacity?: number }) {
  const path = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(path, {
    x,
    y: y + h,
    color: opt.fill,
    opacity: opt.opacity,
    borderColor: opt.stroke,
    borderWidth: opt.stroke ? (opt.strokeWidth ?? 0.8) : 0,
  });
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

  // Filigrane : l'emblème, très pâle, au centre de la page.
  page.drawImage(emblem, { x: W / 2 - 150, y: 210, width: 300, height: 300, opacity: 0.03 });

  // ── Bandeau ────────────────────────────────────────────────────────────
  const bandH = 128;
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
  page.drawRectangle({ x: 0, y: H - bandH - 4, width: W, height: 4, color: C.brand });
  const logoW = 182;
  page.drawImage(logoWhite, { x: M, y: H - bandH / 2 - logoW / LOGO_RATIO / 2 + 2, width: logoW, height: logoW / LOGO_RATIO });

  text(title.toUpperCase(), W - M, H - 58, { font: f.black, size: 30, color: C.white, align: 'right' });
  text(`N° ${inv.number}`, W - M, H - 78, { font: f.bold, size: 12.5, color: C.brand, align: 'right' });
  // Pastille d'état.
  const pill = isCredit ? 'REMBOURSEMENT' : 'PAYÉE';
  const pillW = f.bold.widthOfTextAtSize(pill, 8) + (isCredit ? 24 : 32);
  roundRect(page, W - M - pillW, H - 106, pillW, 17, 8.5, { fill: isCredit ? C.brand : C.green });
  if (!isCredit) page.drawSvgPath('M 0 4 L 3 7 L 8 0', { x: W - M - pillW + 9, y: H - 92.5, borderColor: C.white, borderWidth: 1.4 });
  text(pill, W - M - pillW / 2 + (isCredit ? 0 : 6), H - 100.5, { font: f.bold, size: 8, color: C.white, align: 'center' });

  // ── Repères : dates, objet, montant ────────────────────────────────────
  let y = H - bandH - 4 - 22;
  const metaH = 56;
  roundRect(page, M, y - metaH, W - 2 * M, metaH, 8, { fill: C.soft, stroke: C.line });
  const period = short((inv.lines[0]?.detail ?? '').replace(/^Période du /i, ''));
  const cells: [string, string][] = isCredit
    ? [
        ['Émis le', short(frenchDate(inv.issued_at))],
        ['Remboursé le', short(frenchDate(inv.paid_at ?? inv.issued_at))],
        ['Facture d’origine', opts.creditedNumber ?? '—'],
        ['Montant', formatCents(inv.total_cents, inv.currency)],
      ]
    : [
        ['Émise le', short(frenchDate(inv.issued_at))],
        ['Payée le', short(frenchDate(inv.paid_at ?? inv.issued_at))],
        ['Période', period || '—'],
        ['Montant', formatCents(inv.total_cents, inv.currency)],
      ];
  const widths = [0.2, 0.2, 0.38, 0.22].map((r) => r * (W - 2 * M));
  let cx = M;
  cells.forEach(([k, v], i) => {
    if (i > 0) page.drawLine({ start: { x: cx, y: y - 12 }, end: { x: cx, y: y - metaH + 12 }, thickness: 0.7, color: C.line });
    label(k, cx + 14, y - 19);
    const last = i === cells.length - 1;
    const lines = wrap(clean(v), last ? f.black : f.bold, last ? 14 : 10.5, widths[i] - 24);
    lines.slice(0, 2).forEach((l, j) =>
      text(l, cx + 14, y - (lines.length > 1 ? 32 : 37) - j * 11.5, { font: last ? f.black : f.bold, size: last ? 14 : lines.length > 1 ? 9.5 : 10.5, color: last ? C.brandDark : C.ink }),
    );
    cx += widths[i];
  });
  y -= metaH + 26;

  // ── Émetteur / client ─────────────────────────────────────────────────
  const colW = (W - 2 * M - 22) / 2;
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
  const seller = [`${SITE.editor.name}, entrepreneur individuel`, SITE.editor.address, `SIRET ${SITE.editor.siret}`, SITE.contactEmail, SITE.domain];
  const partyH = 26 + 16 + Math.max(seller.length, buyer.length) * 12.5 + 12;

  label('Émetteur', M, y - 14, { color: C.brandDark });
  text(SITE.name, M, y - 31, { font: f.black, size: 13 });
  seller.forEach((s, i) => text(s, M, y - 46 - i * 12.5, { size: 9.5, color: C.muted }));

  const bx = M + colW + 22;
  roundRect(page, bx, y - partyH, colW, partyH, 8, { fill: C.brandTint });
  page.drawRectangle({ x: bx, y: y - partyH + 8, width: 3, height: partyH - 16, color: C.brand });
  label(isCredit ? 'Au profit de' : 'Facturé à', bx + 16, y - 14, { color: C.brandDark });
  const nameLines = wrap(clean(c.name || c.email), f.black, 13, colW - 30);
  nameLines.forEach((l, i) => text(l, bx + 16, y - 31 - i * 14, { font: f.black, size: 13 }));
  buyer.forEach((s, i) => text(s, bx + 16, y - 46 - (nameLines.length - 1) * 14 - i * 12.5, { size: 9.5, color: C.ink }));
  y -= partyH + 28;

  // ── Lignes ─────────────────────────────────────────────────────────────
  const col = { qty: W - M - 180, unit: W - M - 92, total: W - M };
  label('Désignation', M, y);
  label('Qté', col.qty, y, { align: 'right' });
  label('Prix unitaire', col.unit, y, { align: 'right' });
  label('Montant', col.total, y, { align: 'right' });
  y -= 9;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.4, color: C.ink });
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
    text(String(l.quantity), col.qty, top, { font: f.medium, size: 10 });
    text(formatCents(l.unit_cents, inv.currency), col.unit, top, { font: f.medium, size: 10, align: 'right' });
    text(formatCents(l.total_cents, inv.currency), col.total, top, { font: f.bold, size: 10.5, align: 'right' });
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: C.line });
    y -= 18;
  }

  // ── Totaux ─────────────────────────────────────────────────────────────
  y -= 4;
  const tx = W - M - 205;
  const totalsTop = y;
  const row = (k: string, v: string) => {
    text(k, tx, y, { size: 9.5, color: C.muted });
    text(v, W - M, y, { font: f.medium, size: 9.5, align: 'right' });
    y -= 17;
  };
  row('Total HT', formatCents(inv.total_cents, inv.currency));
  row('TVA', 'Non applicable');
  y -= 6;
  const boxH = 46;
  roundRect(page, tx - 14, y - boxH + 12, W - M - tx + 14, boxH, 9, { fill: C.ink });
  text(isCredit ? 'MONTANT REMBOURSÉ' : 'TOTAL TTC', tx, y - 9, { font: f.bold, size: 8, color: C.brand });
  text(formatCents(inv.total_cents, inv.currency), W - M - 14, y - 15, { font: f.black, size: 20, color: C.white, align: 'right' });
  y -= boxH + 6;
  text(SITE.vatMention, W - M, y, { size: 8, color: C.muted, align: 'right' });

  // À gauche des totaux : remerciement et règlement.
  const lx = M;
  const lw = tx - M - 34;
  let ly = totalsTop;
  text(isCredit ? 'Votre remboursement est en route.' : 'Merci pour votre confiance !', lx, ly, { font: f.black, size: 14 });
  ly -= 20;
  const pm = (inv.payment_method || '').replace(/ (\d{4})$/, '\u00a0$1');
  const when = short(frenchDate(inv.paid_at ?? inv.issued_at));
  const settled = isCredit ? `Remboursé le ${when} ${pm || 'sur le moyen de paiement d’origine'}.` : `Réglée le ${when}${pm ? ` par ${pm}` : ''}.`;
  roundRect(page, lx, ly - 30, lw, 34, 7, { fill: isCredit ? C.brandTint : C.greenTint });
  if (!isCredit) page.drawSvgPath('M 0 4 L 3.5 7.5 L 9 0', { x: lx + 11, y: ly - 9, borderColor: C.green, borderWidth: 1.6 });
  wrap(clean(settled), f.medium, 9, lw - 38)
    .slice(0, 2)
    .forEach((s, i, arr) => text(s, lx + (isCredit ? 12 : 28), ly - (arr.length > 1 ? 9 : 15) - i * 11, { font: f.medium, size: 9, color: isCredit ? C.brandDark : C.green }));
  ly -= 50;
  for (const s of wrap(clean(`Une question sur ce document ? Écrivez-nous à ${SITE.contactEmail} en rappelant son numéro. Tous vos documents sont aussi disponibles dans votre espace, rubrique « Abonnement ».`), f.regular, 8.5, lw)) {
    text(s, lx, ly, { size: 8.5, color: C.muted });
    ly -= 11;
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
