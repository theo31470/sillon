import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { daysAgoIso, formatDate, formatEuros } from '@/lib/format';
import { PLANS } from '@/lib/plans';
import type { Payment } from '@/lib/types';
import { Badge, Card, Notice } from '@/components/ui';

export const metadata = { title: 'Abonnements & paiements' };

const stripeDashboard = (path: string) => `https://dashboard.stripe.com/${process.env.STRIPE_SECRET_KEY?.startsWith('sk_test') ? 'test/' : ''}${path}`;

export default async function PaymentsPage() {
  await requireAdmin('/admin/paiements');
  const supabase = await createClient();
  const since30 = daysAgoIso(30);

  const [subs, paid30, failed, recent, profiles] = await Promise.all([
    supabase.from('subscriptions').select('status, plan, cancel_at_period_end, updated_at'),
    supabase.from('payments').select('amount_cents').eq('status', 'paid').gte('created_at', since30),
    supabase.from('payments').select('*').eq('status', 'failed').order('created_at', { ascending: false }).limit(20),
    supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(20),
    supabase.from('profiles').select('id, farm_name, full_name, email'),
  ]);
  const names = new Map((profiles.data ?? []).map((p) => [p.id, p.farm_name || p.full_name || p.email]));
  const s = subs.data ?? [];
  const kpis = [
    { label: 'Encaissé sur 30 jours', value: formatEuros((paid30.data ?? []).reduce((a, p) => a + p.amount_cents, 0)) },
    { label: 'Abonnements actifs', value: s.filter((x) => x.status === 'active').length },
    { label: 'Essais en cours', value: s.filter((x) => x.status === 'trialing').length },
    { label: 'Résiliations à venir', value: s.filter((x) => x.cancel_at_period_end && x.status !== 'canceled').length },
  ];
  const byPlan = (plan: string) => s.filter((x) => x.plan === plan && ['active', 'trialing', 'past_due'].includes(x.status)).length;

  const row = (p: Payment, failedView = false) => (
    <tr key={p.id}>
      <td className="border-b border-line-soft px-3 py-3">{formatDate(p.created_at)}</td>
      <td className="border-b border-line-soft px-3 py-3 font-medium">{p.user_id ? <Link href={`/admin/membres?id=${p.user_id}`} className="text-ink hover:text-brand">{names.get(p.user_id) ?? '—'}</Link> : '—'}</td>
      <td className="border-b border-line-soft px-3 py-3">{formatEuros(p.amount_cents, p.currency)}</td>
      <td className="border-b border-line-soft px-3 py-3">
        {failedView ? `${p.attempt_count} tentative${p.attempt_count > 1 ? 's' : ''}` : p.status === 'paid' ? <Badge tone="green">Payé</Badge> : p.status === 'failed' ? <Badge tone="amber">Échec</Badge> : <Badge>Remboursé</Badge>}
      </td>
      <td className="border-b border-line-soft px-3 py-3 text-right">
        <a href={stripeDashboard(`invoices/${p.id}`)} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand">
          {p.status === 'paid' ? 'Facture / rembourser' : 'Voir dans Stripe'}
        </a>
      </td>
    </tr>
  );
  const head = (cols: string[]) => (
    <thead><tr className="text-left text-[13px] text-muted">{cols.map((h) => <th key={h} className="border-b border-line px-3 py-2.5 font-medium">{h}</th>)}</tr></thead>
  );

  return (
    <>
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Abonnements & paiements</h1>
        <p className="text-muted">Données synchronisées automatiquement depuis Stripe.</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 md:[grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-line bg-surface p-3.5 sm:p-5">
            <p className="mb-1.5 text-sm text-muted">{k.label}</p>
            <p className="text-[26px] font-bold">{k.value}</p>
          </div>
        ))}
      </div>

      <Card className={failed.data?.length ? 'border-warn-line' : ''}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Paiements en échec</h2>
          <p className="text-sm text-muted">Stripe relance automatiquement selon vos réglages de relance.</p>
        </div>
        {failed.data?.length ? (
          <div className="overflow-x-auto"><table className="w-full min-w-[600px] border-collapse text-sm">{head(['Date', 'Membre', 'Montant', 'Relances', ''])}<tbody>{(failed.data as Payment[]).map((p) => row(p, true))}</tbody></table></div>
        ) : (
          <p className="text-muted">Aucun paiement en échec.</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-3.5 text-lg font-semibold">Formules</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 md:[grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {(['free', 'complet', 'groupement'] as const).map((k) => (
            <div key={k} className={`rounded-xl p-4 ${k === 'complet' ? 'border-2 border-brand' : 'border border-line'}`}>
              <p className="font-semibold">{PLANS[k].name}</p>
              <p className="my-1.5 text-xl font-bold">{PLANS[k].priceLabel} {PLANS[k].period}</p>
              <p className="text-sm text-muted">{k === 'free' ? 'Sans abonnement' : `${byPlan(k)} abonnement(s) en cours`}</p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Notice tone="gray">
            Les prix se modifient dans Stripe (Catalogue de produits), puis dans la variable STRIPE_PRICE_COMPLET. Codes promo : Stripe → Coupons.{' '}
            <a href={stripeDashboard('products')} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand">Ouvrir Stripe</a>
          </Notice>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Derniers paiements</h2>
        {recent.data?.length ? (
          <div className="overflow-x-auto"><table className="w-full min-w-[600px] border-collapse text-sm">{head(['Date', 'Membre', 'Montant', 'Statut', ''])}<tbody>{(recent.data as Payment[]).map((p) => row(p))}</tbody></table></div>
        ) : (
          <p className="text-muted">Aucun paiement pour le moment.</p>
        )}
        <p className="mt-3.5 text-[13px] text-muted">Les remboursements se font dans Stripe (traçabilité bancaire complète). Les numéros de carte ne passent jamais par Tracteurs & Co.</p>
      </Card>
    </>
  );
}
