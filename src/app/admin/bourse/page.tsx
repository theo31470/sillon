import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/admin';
import type { Listing } from '@/lib/bourse';
import { LISTING_STATUS, REPORT_REASONS, listingPath, priceLabel, type ReportReason } from '@/lib/bourse-shared';
import { daysAgoIso, formatDate } from '@/lib/format';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Card, Input } from '@/components/ui';
import { dismissReports, moderateListing, restoreListing } from './actions';

export const metadata = { title: 'Bourse' };

type Report = { id: string; listing_id: string; reason: ReportReason; details: string; created_at: string };

export default async function AdminBoursePage() {
  await requireAdmin('/admin/bourse');
  const db = createServiceClient();
  const since = daysAgoIso(7);
  const [{ data: reportRows }, { data: recentRows }, online, week, convs, sold] = await Promise.all([
    db.from('listing_reports').select('id, listing_id, reason, details, created_at').is('handled_at', null).order('created_at', { ascending: false }).limit(100),
    db.from('listings').select('*').neq('status', 'brouillon').order('created_at', { ascending: false }).limit(40),
    db.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'en_ligne'),
    db.from('listings').select('id', { count: 'exact', head: true }).gte('published_at', since),
    db.from('listing_conversations').select('id', { count: 'exact', head: true }).gte('created_at', since),
    db.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'vendue'),
  ]);
  const reports = (reportRows ?? []) as Report[];
  const reportedIds = [...new Set(reports.map((r) => r.listing_id))];
  const { data: reportedRows } = reportedIds.length ? await db.from('listings').select('*').in('id', reportedIds) : { data: [] };
  const reported = (reportedRows ?? []) as Listing[];
  const recent = (recentRows ?? []) as Listing[];
  const kpis = [
    ['Annonces en ligne', online.count ?? 0],
    ['Publiées sur 7 jours', week.count ?? 0],
    ['Conversations sur 7 jours', convs.count ?? 0],
    ['Annonces vendues', sold.count ?? 0],
  ] as const;

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bourse au matériel</h1>
        <p className="text-muted">Annonces des membres, signalements et modération.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(([k, v]) => (
          <Card key={k} className="flex flex-col gap-1">
            <span className="text-sm text-muted">{k}</span>
            <span className="text-2xl font-bold">{v}</span>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="mb-3 text-xl font-semibold">Signalements à traiter {reports.length ? <Badge tone="amber">{reports.length}</Badge> : null}</h2>
        {reported.length === 0 ? (
          <p className="rounded-xl bg-ground px-4 py-3 text-sm text-muted">Aucun signalement en attente.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {reported.map((l) => (
              <li key={l.id} className="flex flex-col gap-2 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={listingPath(l)} target="_blank" className="font-semibold hover:text-brand">{l.title}</Link>
                  <span className="text-sm text-muted">{priceLabel(l.price_cents)} · {LISTING_STATUS[l.status]}</span>
                  <Link href={`/admin/membres/${l.seller_id}`} className="text-sm font-semibold text-brand-dark hover:underline">Vendeur</Link>
                </div>
                <ul className="flex flex-col gap-1 text-sm">
                  {reports.filter((r) => r.listing_id === l.id).map((r) => (
                    <li key={r.id}>
                      <Badge tone="red">{REPORT_REASONS[r.reason]}</Badge> <span className="text-muted">{formatDate(r.created_at)}</span> {r.details}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-start gap-3">
                  <ActionForm action={moderateListing} className="flex flex-wrap items-start gap-2">
                    <input type="hidden" name="id" value={l.id} />
                    <Input name="note" placeholder="Motif montré au vendeur" maxLength={300} className="min-h-10 w-64 py-1.5 text-sm" />
                    <SubmitButton variant="danger" pendingLabel="…">Retirer l’annonce</SubmitButton>
                  </ActionForm>
                  <form action={dismissReports}>
                    <input type="hidden" name="id" value={l.id} />
                    <button type="submit" className="min-h-11 px-3 text-sm font-semibold text-muted hover:text-ink">Laisser en ligne</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-xl font-semibold">Dernières annonces</h2>
        {recent.length === 0 ? (
          <p className="rounded-xl bg-ground px-4 py-3 text-sm text-muted">Aucune annonce publiée pour le moment.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {recent.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="size-12 flex-none overflow-hidden rounded-lg bg-ground">
                  {l.photos[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- photo de l'annonce
                    <img src={l.photos[0].url} alt="" className="size-full object-cover" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-[1_1_240px]">
                  <Link href={listingPath(l)} target="_blank" className="block truncate font-semibold hover:text-brand">{l.title}</Link>
                  <span className="text-sm text-muted">{priceLabel(l.price_cents)} · {l.city} ({l.department}) · {formatDate(l.created_at)} · {l.views} vues</span>
                </span>
                <Badge tone={l.status === 'moderee' ? 'red' : l.status === 'en_ligne' ? 'green' : 'gray'}>{LISTING_STATUS[l.status]}</Badge>
                {l.status === 'moderee' ? (
                  <form action={restoreListing}>
                    <input type="hidden" name="id" value={l.id} />
                    <button type="submit" className="text-sm font-semibold text-brand-dark hover:underline">Remettre en ligne</button>
                  </form>
                ) : ['en_ligne', 'reservee'].includes(l.status) ? (
                  <ActionForm action={moderateListing} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={l.id} />
                    <SubmitButton variant="small" pendingLabel="…">Retirer</SubmitButton>
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
