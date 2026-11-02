import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { publicName } from '@/lib/bourse';
import { handoverCode, settleBoursePayment, type ListingOrder } from '@/lib/bourse-pay';
import { CARRIERS, HANDOVER_MAX_DAYS, ORDER_STATUS, RELEASE_DAYS_AFTER_SHIPPING, trackingLink } from '@/lib/bourse-shared';
import { formatDate, formatEuros } from '@/lib/format';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { PaySteps } from '@/components/pay-steps';
import { Badge, Card, Input, Notice, Select, Textarea, btn } from '@/components/ui';
import { cancelAction, disputeAction, handoverAction, receiptAction, shippedAction } from './actions';
import { PurchaseCelebration } from './purchase-celebration';

export const metadata: Metadata = { title: 'Transaction · Bourse' };

const TONE: Record<ListingOrder['status'], 'green' | 'amber' | 'gray' | 'red' | 'blue'> = {
  pending: 'gray',
  paid: 'amber',
  shipped: 'blue',
  completed: 'green',
  canceled: 'gray',
  refunded: 'gray',
  disputed: 'red',
  abandoned: 'gray',
};

export default async function TransactionPage(props: PageProps<'/app/transactions/[id]'>) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { session, profile } = await requireUser(`/app/transactions/${id}`);
  const { fete, redirect_status } = await props.searchParams;
  const supabase = await createClient();
  const load = async () => (await supabase.from('listing_orders').select('*').eq('id', id).maybeSingle()).data as ListingOrder | null;
  let o = await load();
  if (!o) notFound();
  // Retour de la validation bancaire (3-D Secure, PayPal) : le paiement est relu chez Stripe.
  if (o.status === 'pending' && o.stripe_payment_intent && redirect_status !== 'failed' && o.buyer_id === session.userId) {
    await settleBoursePayment(o.stripe_payment_intent).catch((err) => console.error('[bourse] retour de paiement', err));
    o = (await load()) ?? o;
  }
  const isBuyer = o.buyer_id === session.userId;
  const isSeller = o.seller_id === session.userId;
  if (!isBuyer && !isSeller) notFound();

  const db = createServiceClient();
  const [{ data: other }, { data: conv }] = await Promise.all([
    db.from('profiles').select('full_name').eq('id', (isBuyer ? o.seller_id : o.buyer_id) ?? '').maybeSingle(),
    o.listing_id && o.buyer_id
      ? supabase.from('listing_conversations').select('id').eq('listing_id', o.listing_id).eq('buyer_id', o.buyer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const otherName = publicName(other?.full_name);
  const s = o.snapshot;
  const sellerGets = o.price_cents + o.shipping_cents;
  const track = o.tracking_url ?? trackingLink(o.carrier, o.tracking_number);

  if (redirect_status === 'failed' && o.status === 'pending') {
    return (
      <Card className="flex flex-col items-start gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Le paiement n’a pas abouti</h1>
        <p className="text-muted">Le paiement a été refusé ou annulé (validation bancaire ou PayPal). Rien n’a été débité, vous pouvez réessayer.</p>
        <Link href={`/app/acheter/${s.ref}`} className={btn.primary}>Réessayer</Link>
      </Card>
    );
  }

  const steps =
    o.mode === 'envoi'
      ? [
          { label: 'Payé', done: Boolean(o.paid_at) },
          { label: 'Expédié', done: Boolean(o.shipped_at) },
          { label: isBuyer ? 'Reçu' : 'Vendeur payé', done: o.status === 'completed' },
        ]
      : [
          { label: 'Payé', done: Boolean(o.paid_at) },
          { label: 'Remis', done: o.status === 'completed' },
          { label: 'Vendeur payé', done: o.status === 'completed' },
        ];
  const closed = ['canceled', 'refunded', 'abandoned'].includes(o.status);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      {fete === '1' && isBuyer && o.status === 'paid' ? (
        <PurchaseCelebration orderId={o.id} firstName={profile.full_name.trim().split(/\s+/)[0] ?? ''} title={s.title} photo={s.photo} mode={o.mode} seller={otherName} />
      ) : null}
      <Link href="/app/transactions" className="self-start font-semibold text-brand-dark hover:underline">← Mes transactions</Link>

      <Card className="flex flex-wrap items-center gap-4">
        <span className="size-20 flex-none overflow-hidden rounded-xl bg-ground">
          {s.photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- photo de l'annonce
            <img src={s.photo} alt="" className="size-full object-cover" />
          ) : null}
        </span>
        <div className="min-w-0 flex-[1_1_240px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TONE[o.status]}>{ORDER_STATUS[o.status]}</Badge>
            <span className="text-sm text-muted">
              {isBuyer ? 'Achat' : 'Vente'} n° {o.ref} · {o.mode === 'envoi' ? 'envoi par colis' : 'remise en main propre'}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{s.title}</h1>
          <p className="text-sm text-muted">
            {isBuyer ? 'Vendeur' : 'Acheteur'} : {otherName}
            {o.paid_at ? ` · payé le ${formatDate(o.paid_at)}` : ''}
          </p>
        </div>
        {conv ? <Link href={`/app/messages/${conv.id}`} className={btn.small}>Écrire à {otherName}</Link> : null}
      </Card>

      {!closed && o.status !== 'pending' ? (
        <Card>
          <PaySteps steps={steps} />
        </Card>
      ) : null}

      {o.status === 'pending' ? <Notice tone="gray">Paiement en cours de validation : cette page se met à jour dès que la banque a répondu (actualisez dans un instant).</Notice> : null}
      {closed && o.status !== 'abandoned' ? (
        <Notice tone="gray">
          Vente annulée{o.canceled_at ? ` le ${formatDate(o.canceled_at)}` : ''}. {isBuyer ? `Vous avez été intégralement remboursé (${formatEuros(o.total_cents)}, frais compris) : comptez 5 à 10 jours selon votre banque.` : 'L’acheteur a été remboursé et votre annonce est remise en ligne.'}
        </Notice>
      ) : null}
      {o.status === 'abandoned' ? <Notice tone="gray">Paiement non finalisé : rien n’a été débité.</Notice> : null}
      {o.status === 'disputed' ? (
        <Notice tone="red">
          Un problème a été signalé{isSeller && o.dispute_reason ? ` : « ${o.dispute_reason} »` : ''}. L’argent reste bloqué le temps que notre équipe examine la vente avec vous deux (sous 48 h).
        </Notice>
      ) : null}
      {o.status === 'completed' ? (
        <Notice tone="green">
          Vente terminée{o.completed_at ? ` le ${formatDate(o.completed_at)}` : ''}.{' '}
          {isSeller ? `${formatEuros(sellerGets)} vous ont été versés : ils arrivent sur votre compte bancaire sous 2 à 7 jours.` : 'Merci pour votre confiance, bon travail avec votre matériel !'}
        </Notice>
      ) : null}

      {/* --- Acheteur --- */}
      {isBuyer && o.status === 'paid' && o.mode === 'main_propre' ? (
        <Card className="flex flex-col items-center gap-3 text-center">
          <h2 className="text-xl font-semibold">Votre code de remise</h2>
          <p className="font-display text-5xl font-bold tracking-[0.3em] text-brand-dark tabular-nums sm:text-6xl">{handoverCode(o.id)}</p>
          <p className="max-w-lg text-sm text-muted">
            Donnez ce code au vendeur <strong>seulement quand vous avez le matériel</strong> et qu’il vous convient : c’est ce code qui lui verse l’argent. Sans remise sous {HANDOVER_MAX_DAYS} jours,
            vous êtes remboursé automatiquement.
          </p>
        </Card>
      ) : null}
      {isBuyer && o.status === 'paid' && o.mode === 'envoi' ? (
        <Card className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">En attente d’expédition</h2>
          <p className="text-muted">{otherName} prépare votre colis. Vous recevrez un e-mail avec le numéro de suivi dès l’envoi.</p>
        </Card>
      ) : null}
      {isBuyer && o.status === 'shipped' ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Votre colis est en route</h2>
          <p className="text-muted">
            {o.carrier} · n° <span className="font-semibold text-ink">{o.tracking_number}</span>
            {track ? (
              <>
                {' '}·{' '}
                <a href={track} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-dark underline underline-offset-4">Suivre le colis</a>
              </>
            ) : null}
          </p>
          <p className="text-sm text-muted">
            Une fois le colis reçu et vérifié, confirmez la réception : le vendeur est alors payé. Sans nouvelles de votre part, il l’est automatiquement le{' '}
            {o.release_at ? formatDate(o.release_at, { day: 'numeric', month: 'long' }) : `${RELEASE_DAYS_AFTER_SHIPPING}e jour`}.
          </p>
          <ActionForm action={receiptAction} className="flex flex-col items-start gap-2">
            <input type="hidden" name="id" value={o.id} />
            <SubmitButton pendingLabel="Confirmation…">J’ai reçu le matériel, tout est en ordre</SubmitButton>
          </ActionForm>
        </Card>
      ) : null}
      {isBuyer && ['paid', 'shipped'].includes(o.status) ? (
        <details className="rounded-2xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-semibold">Un problème avec cet achat ?</summary>
          <ActionForm action={disputeAction} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="id" value={o.id} />
            <p className="text-sm text-muted">Colis abîmé, matériel non conforme à l’annonce, vendeur injoignable : décrivez le problème. L’argent est bloqué et notre équipe vous recontacte.</p>
            <Textarea name="reason" rows={3} maxLength={1000} required placeholder="Ce qui ne va pas…" />
            <SubmitButton variant="danger" pendingLabel="Envoi…" className="self-start">Signaler un problème</SubmitButton>
          </ActionForm>
        </details>
      ) : null}

      {/* --- Vendeur --- */}
      {isSeller && o.status === 'paid' && o.mode === 'main_propre' ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Remise en main propre</h2>
          <p className="text-muted">
            Convenez d’un rendez-vous avec l’acheteur ({otherName}) par la messagerie. À la remise, il vous donne son code à 6 chiffres : saisissez-le ici et {formatEuros(sellerGets)} vous sont versés aussitôt.
          </p>
          <ActionForm action={handoverAction} className="flex flex-wrap items-start gap-2">
            <input type="hidden" name="id" value={o.id} />
            <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required placeholder="123456" aria-label="Code de remise" className="w-40 text-center text-xl tracking-[0.25em]" />
            <SubmitButton pendingLabel="Vérification…">Valider la remise</SubmitButton>
          </ActionForm>
        </Card>
      ) : null}
      {isSeller && o.mode === 'envoi' && o.recipient && ['paid', 'shipped', 'disputed'].includes(o.status) ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{o.status === 'paid' ? 'À expédier' : 'Adresse de livraison'}</h2>
          <address className="rounded-xl bg-ground px-4 py-3 not-italic leading-relaxed">
            <strong>{o.recipient.name}</strong>
            <br />
            {o.recipient.address1}
            {o.recipient.address2 ? (
              <>
                <br />
                {o.recipient.address2}
              </>
            ) : null}
            <br />
            {o.recipient.zip} {o.recipient.city}
            {o.recipient.phone ? (
              <>
                <br />
                Tél. {o.recipient.phone}
              </>
            ) : null}
          </address>
          {o.status === 'paid' ? (
            <>
              <p className="text-sm text-muted">
                Expédiez le colis avec un numéro de suivi (les frais de port payés par l’acheteur, {formatEuros(o.shipping_cents)}, vous sont reversés avec le prix), puis indiquez-le ici. Vous êtes
                payé dès que l’acheteur confirme la réception, au plus tard {RELEASE_DAYS_AFTER_SHIPPING} jours après l’expédition.
              </p>
              <ActionForm action={shippedAction} className="flex flex-wrap items-start gap-2">
                <input type="hidden" name="id" value={o.id} />
                <Select name="carrier" required defaultValue="" aria-label="Transporteur" className="w-48">
                  <option value="" disabled>Transporteur…</option>
                  {CARRIERS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
                <Input name="tracking" required maxLength={60} placeholder="Numéro de suivi" aria-label="Numéro de suivi" className="w-56" />
                <SubmitButton pendingLabel="Enregistrement…">Colis expédié</SubmitButton>
              </ActionForm>
            </>
          ) : o.tracking_number ? (
            <p className="text-sm text-muted">
              Expédié le {o.shipped_at ? formatDate(o.shipped_at) : '—'} · {o.carrier} n° {o.tracking_number}
              {o.status === 'shipped' && o.release_at ? ` · versement automatique le ${formatDate(o.release_at, { day: 'numeric', month: 'long' })} au plus tard` : ''}
            </p>
          ) : null}
        </Card>
      ) : null}
      {isSeller && o.status === 'paid' ? (
        <details className="rounded-2xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-semibold text-danger">Annuler la vente</summary>
          <ActionForm action={cancelAction} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="id" value={o.id} />
            <p className="text-sm text-muted">L’acheteur est intégralement remboursé (frais compris) et votre annonce est remise en ligne.</p>
            <Input name="reason" maxLength={300} placeholder="Motif (montré à l’acheteur)" />
            <SubmitButton variant="danger" pendingLabel="Annulation…" className="self-start">Oui, annuler et rembourser</SubmitButton>
          </ActionForm>
        </details>
      ) : null}

      <Card>
        <h2 className="mb-3 text-xl font-semibold">Montants</h2>
        <dl className="flex max-w-md flex-col gap-2 text-[15px]">
          <div className="flex justify-between gap-3"><dt className="text-muted">Prix</dt><dd className="tabular-nums">{formatEuros(o.price_cents)}</dd></div>
          {o.shipping_cents ? <div className="flex justify-between gap-3"><dt className="text-muted">Frais de port</dt><dd className="tabular-nums">{formatEuros(o.shipping_cents)}</dd></div> : null}
          {isBuyer ? (
            <>
              <div className="flex justify-between gap-3"><dt className="text-muted">Frais de service</dt><dd className="tabular-nums">{formatEuros(o.fee_cents)}</dd></div>
              <div className="flex justify-between gap-3 border-t border-line pt-2 font-bold"><dt>Total payé</dt><dd className="tabular-nums">{formatEuros(o.total_cents)}</dd></div>
            </>
          ) : (
            <div className="flex justify-between gap-3 border-t border-line pt-2 font-bold"><dt>Vous recevez</dt><dd className="tabular-nums">{formatEuros(sellerGets)}</dd></div>
          )}
        </dl>
        {isSeller ? <p className="mt-3 text-sm text-muted">Aucune commission pour vous : les frais de service sont payés par l’acheteur.</p> : null}
      </Card>
    </div>
  );
}
