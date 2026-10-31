import type { Metadata } from 'next';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import { COMPLET_PRICES, FREE_MACHINE_LIMIT, PLANS, TRIAL_DAYS } from '@/lib/plans';
import { env } from '@/lib/env';
import { SITE } from '@/lib/site';
import { EMPTY_BILLING, getBillingDetails } from '@/lib/billing-details';
import { loadSubscriptionView, type SubscriptionView } from '@/lib/subscription-view';
import { formatCents } from '@/lib/invoices/types';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Card, CheckIcon, Notice } from '@/components/ui';
import { cancelSubscription, changePeriod, resumeSubscription, updateBilling } from './actions';
import { BillingFields } from './billing-fields';
import { CardUpdate, StripeReturn } from './card-update';
import { CheckoutForm } from './checkout-form';
import { ReferralShare } from './referral-share';
import { REFERRAL_COOKIE, REFERRAL_REWARD_CENTS, referralStats, type ReferralStats } from '@/lib/referrals';

export const metadata: Metadata = { title: 'Abonnement' };

const long = (d: string | null) => (d ? formatDate(d, { day: 'numeric', month: 'long', year: 'numeric' }) : '');

function statusBadge(v: SubscriptionView) {
  if (v.status === 'past_due' || v.status === 'unpaid') return <Badge tone="red">Paiement en retard</Badge>;
  if (v.cancelAt) return <Badge tone="amber">Résiliation programmée</Badge>;
  if (v.status === 'trialing') return <Badge tone="blue">Essai gratuit</Badge>;
  return <Badge tone="green">Actif</Badge>;
}

type InvoiceListRow = { id: string; number: string; kind: 'facture' | 'avoir'; issued_at: string; total_cents: number; currency: string };

export default async function SubscriptionPage(props: PageProps<'/app/abonnement'>) {
  const { session, profile } = await requireUser('/app/abonnement');
  const { statut, raison } = await props.searchParams;
  const supabase = await createClient();
  const [billing, { data: invoiceRows }, { count: subCount }, view] = await Promise.all([
    getBillingDetails(session.userId),
    supabase.from('invoices').select('id, number, kind, issued_at, total_cents, currency').order('issued_at', { ascending: false }).limit(60),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }),
    profile.stripe_customer_id
      ? loadSubscriptionView(profile.stripe_customer_id).catch((err) => {
          console.error('[abonnement] lecture Stripe', err);
          return 'erreur' as const;
        })
      : Promise.resolve(null),
  ]);
  const invoices = (invoiceRows ?? []) as InvoiceListRow[];
  const referral: ReferralStats | null = await referralStats(session.userId, profile.stripe_customer_id).catch((err) => {
    console.error('[parrainage]', err);
    return null;
  });
  // Code de parrainage retenu par le lien d'invitation : proposé d'office au premier abonnement.
  const invitedBy = (await cookies()).get(REFERRAL_COOKIE)?.value ?? '';
  const initialPromo = !subCount && /^[A-Z0-9]{4,12}$/.test(invitedBy) && invitedBy !== referral?.code ? invitedBy : '';
  const defaults = billing ?? { ...EMPTY_BILLING, name: profile.farm_name || profile.full_name };
  const annualAvailable = Boolean(env.stripePriceCompletAnnuel());
  const sub = view && view !== 'erreur' ? view : null;
  const price = sub ? COMPLET_PRICES[sub.period] : null;

  return (
    <>
      <div>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-3xl">Abonnement</h1>
        <p className="text-muted">Votre formule, votre carte, vos informations de facturation et vos factures {SITE.name}.</p>
      </div>
      <Suspense fallback={null}>
        <StripeReturn />
      </Suspense>
      {statut === 'merci' ? <Notice tone="green">Merci ! Votre formule Complet est active. Votre facture vous sera envoyée par e-mail à chaque paiement.</Notice> : null}
      {raison === 'limite' ? <Notice>La formule gratuite est limitée à {FREE_MACHINE_LIMIT} machines : passez à la formule Complet pour un parc illimité.</Notice> : null}
      {raison === 'rapport' ? <Notice>Le rapport d’historique pour la revente est inclus dans la formule Complet.</Notice> : null}
      {view === 'erreur' ? <Notice tone="red">Le service de paiement ne répond pas pour le moment : les informations de votre abonnement s’afficheront dans quelques instants.</Notice> : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-5 lg:gap-6">
          {sub && price ? (
            <>
              <Card>
                <p className="text-sm text-muted">Votre formule</p>
                <h2 className="mb-1 flex flex-wrap items-center gap-3 text-2xl font-bold">
                  Complet {statusBadge(sub)}
                </h2>
                <p className="mb-4 text-lg">
                  <strong className="tabular-nums">{formatCents(sub.amountCents)}</strong> <span className="text-muted">{sub.period === 'annuel' ? 'par an' : 'par mois'}</span>
                  {sub.discount ? <span className="ml-2"><Badge tone="green">Code {sub.discount}</Badge></span> : null}
                </p>

                <div className="mb-5 flex flex-col gap-1.5 rounded-xl bg-ground p-4 text-[15px]">
                  {sub.cancelAt ? (
                    <p>Votre formule se termine le <strong>{long(sub.cancelAt)}</strong>. Aucun nouveau paiement ne sera prélevé.</p>
                  ) : sub.status === 'trialing' ? (
                    <p>
                      Essai gratuit jusqu’au <strong>{long(sub.trialEnd)}</strong>. Premier paiement de {formatCents(sub.amountCents)} ce jour-là.
                    </p>
                  ) : sub.status === 'past_due' ? (
                    <p className="text-danger">Le dernier paiement a été refusé. Mettez à jour votre carte ci-dessous pour garder la formule Complet.</p>
                  ) : (
                    <p>
                      Prochain paiement de {formatCents(sub.amountCents)} le <strong>{long(sub.periodEnd)}</strong>.
                    </p>
                  )}
                  {sub.pendingPeriod ? (
                    <p className="text-brand-dark">
                      Passage à la formule {sub.pendingPeriod === 'annuel' ? 'annuelle' : 'mensuelle'} prévu le {long(sub.pendingAt)}.
                    </p>
                  ) : null}
                </div>

                <ul className="mb-5 grid gap-1.5 text-[15px] sm:grid-cols-2">
                  {PLANS.complet.features.filter((f) => !f.includes('essai')).map((f) => (
                    <li key={f} className="flex gap-2"><CheckIcon className="mt-0.5 flex-none text-brand" />{f}</li>
                  ))}
                </ul>

                {sub.cancelAt ? (
                  <ActionForm action={resumeSubscription} resetOnSuccess={false} className="flex flex-col gap-3">
                    <SubmitButton pendingLabel="…">Continuer mon abonnement</SubmitButton>
                  </ActionForm>
                ) : (
                  <div className="flex flex-col gap-4">
                    {annualAvailable ? (
                      <ActionForm action={changePeriod} resetOnSuccess={false} className="flex flex-col gap-3">
                        {sub.pendingPeriod ? (
                          <>
                            <input type="hidden" name="periode" value={sub.period} />
                            <SubmitButton variant="secondary" pendingLabel="…">Annuler le changement de formule</SubmitButton>
                          </>
                        ) : sub.period === 'mensuel' ? (
                          <>
                            <input type="hidden" name="periode" value="annuel" />
                            <SubmitButton variant="secondary" pendingLabel="…">
                              Passer à l’annuel : {COMPLET_PRICES.annuel.label} {COMPLET_PRICES.annuel.period} ({COMPLET_PRICES.annuel.saving})
                            </SubmitButton>
                            <p className="text-sm text-muted">{sub.status === 'trialing' ? 'Pris en compte à la fin de l’essai.' : 'Pris en compte à la prochaine échéance : pas de double paiement.'}</p>
                          </>
                        ) : (
                          <>
                            <input type="hidden" name="periode" value="mensuel" />
                            <SubmitButton variant="secondary" pendingLabel="…">Passer au mensuel ({COMPLET_PRICES.mensuel.label} {COMPLET_PRICES.mensuel.period})</SubmitButton>
                            <p className="text-sm text-muted">{sub.status === 'trialing' ? 'Pris en compte à la fin de l’essai.' : 'Pris en compte à la fin de l’année en cours.'}</p>
                          </>
                        )}
                      </ActionForm>
                    ) : null}
                    <details className="group rounded-xl border border-line">
                      <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-danger marker:hidden">Résilier l’abonnement</summary>
                      <div className="flex flex-col gap-3 border-t border-line px-4 py-4">
                        <p className="text-sm">
                          Vous gardez la formule Complet jusqu’au <strong>{long(sub.status === 'trialing' ? sub.trialEnd : sub.periodEnd)}</strong>, puis votre compte repasse en formule Gratuit.
                          Vos machines et vos données sont conservées. Vous pourrez changer d’avis jusqu’à cette date.
                        </p>
                        <ActionForm action={cancelSubscription} resetOnSuccess={false} className="flex flex-col gap-3">
                          <SubmitButton variant="danger" pendingLabel="…">Confirmer la résiliation</SubmitButton>
                        </ActionForm>
                      </div>
                    </details>
                  </div>
                )}
              </Card>

              <Card>
                <h2 className="mb-3 text-xl font-semibold">Moyen de paiement</h2>
                {sub.openInvoice ? (
                  <div className="mb-4">
                    <Notice tone="red">Paiement de {formatCents(sub.openInvoice.amountCents)} refusé par votre banque. Enregistrez une carte valide : il sera réglé aussitôt.</Notice>
                  </div>
                ) : null}
                <CardUpdate card={sub.card} pastDue={Boolean(sub.openInvoice)} />
              </Card>
            </>
          ) : view !== 'erreur' ? (
            <Card>
              <p className="text-sm text-muted">Votre formule</p>
              <h2 className="mb-2 text-2xl font-bold">{profile.comp_active ? 'Complet (offerte)' : 'Gratuit'}</h2>
              {profile.comp_active ? (
                <p className="mb-5 text-muted">Formule offerte par {SITE.name}{profile.comp_until ? ` jusqu’au ${long(profile.comp_until)}` : ''}. Vous pouvez vous abonner dès maintenant pour la suite.</p>
              ) : (
                <p className="mb-5 text-muted">
                  Jusqu’à {FREE_MACHINE_LIMIT} machines. Passez à la formule Complet pour un parc illimité, le coût de revient à l’heure, le rapport de revente et l’aide au diagnostic.
                  {subCount ? '' : ` ${TRIAL_DAYS} jours d’essai offerts.`}
                </p>
              )}
              <CheckoutForm trial={!subCount} annualAvailable={annualAvailable} billing={defaults} vatMention={SITE.vatMention} initialPromo={initialPromo} />
            </Card>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-5 lg:gap-6">
          {referral ? (
            <Card className="scroll-mt-24">
              <h2 className="mb-1 text-xl font-semibold" id="parrainage">
                Parrainez un voisin
              </h2>
              <p className="mb-4 text-sm text-muted">
                La personne que vous invitez a <strong className="text-ink">un mois offert</strong> en plus de l’essai. Vous, vous gagnez{' '}
                <strong className="text-ink">un mois d’abonnement ({formatCents(REFERRAL_REWARD_CENTS)})</strong> dès son premier paiement. Sans limite.
              </p>
              <ReferralShare link={referral.link} code={referral.code} />
              {referral.pending || referral.rewarded || referral.creditCents ? (
                <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-ground p-3 text-center">
                  <div>
                    <dt className="text-xs text-muted">Invités abonnés</dt>
                    <dd className="text-lg font-bold tabular-nums">{referral.pending + referral.rewarded}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Mois gagnés</dt>
                    <dd className="text-lg font-bold tabular-nums">{referral.rewarded}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Crédit à déduire</dt>
                    <dd className="text-lg font-bold tabular-nums">{formatCents(referral.creditCents)}</dd>
                  </div>
                </dl>
              ) : null}
              {referral.pending ? (
                <p className="mt-2 text-xs text-muted">
                  {referral.pending} invité{referral.pending > 1 ? 's' : ''} en période d’essai : votre mois sera crédité à leur premier paiement.
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card className="scroll-mt-24">
            <h2 className="mb-1 text-xl font-semibold" id="factures">Factures</h2>
            <p className="mb-3 text-sm text-muted">Émises par {SITE.name} à chaque paiement, aussi envoyées par e-mail.</p>
            {invoices.length === 0 ? (
              <p className="rounded-xl bg-ground px-4 py-3 text-sm text-muted">Aucune facture pour le moment.{sub?.status === 'trialing' ? ' La première arrivera à la fin de votre essai.' : ''}</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold tabular-nums">
                        {inv.kind === 'avoir' ? 'Avoir' : 'Facture'} {inv.number}
                      </span>
                      <span className="text-sm text-muted">{long(inv.issued_at)}</span>
                    </span>
                    <span className={`font-semibold tabular-nums ${inv.kind === 'avoir' ? 'text-success' : ''}`}>
                      {inv.kind === 'avoir' ? '− ' : ''}
                      {formatCents(inv.total_cents, inv.currency)}
                    </span>
                    <a href={`/api/factures/${inv.id}?telecharger`} className="inline-flex min-h-10 items-center rounded-lg border border-field px-3 text-sm font-semibold hover:border-brand hover:text-brand-dark" aria-label={`Télécharger ${inv.kind === 'avoir' ? 'l’avoir' : 'la facture'} ${inv.number} (PDF)`}>
                      PDF
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-1 text-xl font-semibold">Informations de facturation</h2>
            <p className="mb-4 text-sm text-muted">Reprises sur vos prochaines factures. Les factures déjà émises ne changent pas.</p>
            {billing || sub ? (
              <ActionForm action={updateBilling} resetOnSuccess={false} className="flex flex-col gap-4">
                <BillingFields defaults={defaults} idPrefix="bf" />
                <SubmitButton variant="secondary" pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
              </ActionForm>
            ) : (
              <p className="rounded-xl bg-ground px-4 py-3 text-sm text-muted">Vous les renseignerez au moment de souscrire.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
