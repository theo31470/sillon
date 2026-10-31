import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { inputClass } from '@/components/ui';
import { formatCents } from '@/lib/invoices/types';
import { refundInvoice, resendInvoice } from './actions';

/** Boutons d'une facture ou d'un avoir : PDF, renvoi par e-mail, remboursement (total ou partiel). */
export function InvoiceActions({ id, kind, refundableCents, currency = 'eur' }: { id: string; kind: 'facture' | 'avoir'; refundableCents: number; currency?: string }) {
  return (
    <div className="flex flex-wrap items-start gap-2 md:justify-end">
      <a href={`/api/factures/${id}?telecharger`} className="inline-flex min-h-10 items-center rounded-lg border border-field px-3 text-sm font-semibold hover:border-brand">PDF</a>
      <ActionForm action={resendInvoice} resetOnSuccess={false} className="flex flex-col gap-2">
        <input type="hidden" name="invoice_id" value={id} />
        <SubmitButton variant="small" pendingLabel="…">Renvoyer</SubmitButton>
      </ActionForm>
      {kind === 'facture' && refundableCents > 0 ? (
        <details className="w-full md:w-auto">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center rounded-lg border border-danger/40 px-3 text-sm font-semibold text-danger">Rembourser</summary>
          <ActionForm action={refundInvoice} className="mt-2 flex flex-col gap-2 rounded-xl border border-line bg-ground p-3">
            <input type="hidden" name="invoice_id" value={id} />
            <label className="text-sm font-semibold" htmlFor={`m-${id}`}>Montant (vide = {formatCents(refundableCents, currency)})</label>
            <input id={`m-${id}`} name="montant" inputMode="decimal" placeholder={(refundableCents / 100).toFixed(2).replace('.', ',')} className={inputClass} />
            <SubmitButton variant="danger" pendingLabel="Remboursement…">Rembourser et émettre l’avoir</SubmitButton>
          </ActionForm>
        </details>
      ) : null}
    </div>
  );
}
