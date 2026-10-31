import 'server-only';
import type Stripe from 'stripe';
import { env } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/admin';
import { euros, notifyBilling } from '@/lib/email/billing';
import { issueCreditNotesForCharge } from './issue';
import { renderInvoicePdf } from './pdf';
import type { InvoiceRow } from './types';

const customerId = (c: string | Stripe.Customer | Stripe.DeletedCustomer | null) => (typeof c === 'string' ? c : c?.id ?? null);

/** Lien de téléchargement et pièce jointe PDF d'une facture ou d'un avoir. */
export async function invoiceAttachment(inv: InvoiceRow, creditedNumber?: string) {
  const pdf = await renderInvoicePdf(inv, { creditedNumber });
  return {
    url: `${env.siteUrl().replace(/\/$/, '')}/api/factures/${inv.id}?telecharger`,
    attachments: [{ filename: `Tracteurs-et-Co-${inv.kind === 'avoir' ? 'avoir' : 'facture'}-${inv.number}.pdf`, content: Buffer.from(pdf).toString('base64') }],
  };
}

/** Remboursement (depuis l'admin ou le tableau de bord Stripe) : avoir + e-mail, paiement marqué remboursé. */
export async function onChargeRefunded(charge: Stripe.Charge, eventId: string) {
  const notes = await issueCreditNotesForCharge(charge);
  for (const { invoice, credited } of notes) {
    if (charge.refunded && credited.stripe_invoice_id) {
      await createServiceClient().from('payments').update({ status: 'refunded' }).eq('id', credited.stripe_invoice_id);
    }
    try {
      const file = await invoiceAttachment(invoice, credited.number);
      await notifyBilling(
        'remboursement',
        { userId: invoice.user_id, customerId: customerId(charge.customer) },
        { amount: euros(invoice.total_cents, invoice.currency), invoiceNumber: invoice.number, invoiceUrl: file.url },
        `${eventId}-${invoice.id}`,
        file.attachments,
      );
    } catch (err) {
      console.error('[stripe] e-mail d’avoir', err);
    }
  }
}

