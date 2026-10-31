import { NextResponse, type NextRequest } from 'next/server';
import { getAdminOrNull, getSession } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/admin';
import { renderInvoicePdf } from '@/lib/invoices/pdf';
import type { InvoiceRow } from '@/lib/invoices/types';

/**
 * Téléchargement d'une facture ou d'un avoir (PDF).
 * Accessible à son titulaire, ou à un administrateur (double authentification).
 */
export async function GET(request: NextRequest, ctx: RouteContext<'/api/factures/[id]'>) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 });

  const session = await getSession();
  if (!session) {
    const login = new URL('/connexion', request.url);
    login.searchParams.set('suite', '/app/abonnement#factures');
    return NextResponse.redirect(login);
  }

  const db = createServiceClient();
  const { data } = await db.from('invoices').select('*').eq('id', id).maybeSingle();
  const invoice = data as InvoiceRow | null;
  const allowed = invoice && (invoice.user_id === session.userId || (await getAdminOrNull()));
  // Même réponse qu'une facture inexistante : on ne révèle pas l'existence des factures des autres.
  if (!invoice || !allowed) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 });

  let creditedNumber: string | undefined;
  if (invoice.credited_invoice_id) {
    const { data: credited } = await db.from('invoices').select('number').eq('id', invoice.credited_invoice_id).maybeSingle();
    creditedNumber = credited?.number;
  }
  const pdf = await renderInvoicePdf(invoice, { creditedNumber });
  const filename = `Tracteurs-et-Co-${invoice.kind === 'avoir' ? 'avoir' : 'facture'}-${invoice.number}.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${request.nextUrl.searchParams.has('telecharger') ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
