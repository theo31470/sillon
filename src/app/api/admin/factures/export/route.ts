import { NextResponse, type NextRequest } from 'next/server';
import { getAdminOrNull } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createServiceClient } from '@/lib/supabase/admin';
import type { InvoiceRow } from '@/lib/invoices/types';

/**
 * Livre des recettes (micro-entreprise) au format CSV, pour Excel ou LibreOffice :
 * séparateur « ; », virgule décimale, encodage UTF-8 avec BOM.
 * Une ligne par encaissement (facture) ou remboursement (avoir, en négatif).
 */
export async function GET(request: NextRequest) {
  const admin = await getAdminOrNull();
  if (!admin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const year = Number(sp.get('annee')) || new Date().getFullYear();
  const month = Number(sp.get('mois')) || null;
  const from = month ? `${year}-${String(month).padStart(2, '0')}-01T00:00:00+01:00` : `${year}-01-01T00:00:00+01:00`;
  const to = month ? (month === 12 ? `${year + 1}-01-01T00:00:00+01:00` : `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00+01:00`) : `${year + 1}-01-01T00:00:00+01:00`;

  const { data } = await createServiceClient().from('invoices').select('*').gte('issued_at', from).lt('issued_at', to).order('issued_at', { ascending: true }).order('number', { ascending: true });
  const rows = (data ?? []) as InvoiceRow[];
  const numberOf = new Map(rows.map((r) => [r.id, r.number]));
  const missing = rows.filter((r) => r.credited_invoice_id && !numberOf.has(r.credited_invoice_id)).map((r) => r.credited_invoice_id!);
  if (missing.length) {
    const { data: extra } = await createServiceClient().from('invoices').select('id, number').in('id', missing);
    for (const e of extra ?? []) numberOf.set(e.id, e.number);
  }

  const cell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const money = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
  const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  const header = ['Date', 'N° de pièce', 'Type', 'Client', 'SIRET client', 'Nature de la prestation', 'Mode de règlement', 'Montant TTC (€)', 'Facture d’origine'];
  const lines = rows.map((r) => {
    const credit = r.kind === 'avoir';
    return [
      date(r.paid_at ?? r.issued_at),
      r.number,
      credit ? 'Avoir' : 'Facture',
      r.customer.name || r.customer.email,
      r.customer.siret ?? '',
      r.lines.map((l) => l.label).join(' + '),
      (r.payment_method || 'carte bancaire').replace(/^sur la /, ''),
      money(credit ? -r.total_cents : r.total_cents),
      credit && r.credited_invoice_id ? numberOf.get(r.credited_invoice_id) ?? '' : '',
    ]
      .map((v) => cell(String(v)))
      .join(';');
  });
  const total = rows.reduce((s, r) => s + (r.kind === 'avoir' ? -r.total_cents : r.total_cents), 0);
  lines.push(['', '', '', '', '', '', 'Total', money(total), ''].join(';'));

  await logAudit(admin.session, 'factures.export', { type: 'invoices', id: `${year}${month ? `-${month}` : ''}` }, { lignes: rows.length });
  const name = `livre-des-recettes-${year}${month ? `-${String(month).padStart(2, '0')}` : ''}.csv`;
  return new NextResponse(`﻿${[header.join(';'), ...lines].join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
