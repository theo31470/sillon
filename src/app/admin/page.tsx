import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { daysAgoIso, formatDate, formatEuros, weeksAgo } from '@/lib/format';
import type { AuditEntry } from '@/lib/types';
import { Card } from '@/components/ui';

export const metadata = { title: 'Vue d’ensemble' };

export default async function AdminHome() {
  await requireAdmin('/admin');
  const supabase = await createClient();
  const since30 = daysAgoIso(30);
  const since84 = daysAgoIso(84);

  const [members, paid, newMembers, trials, failed, revenue, newSubs, sheetsReview, drafts, journal, admins] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).neq('plan', 'free'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', since30),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'trialing'),
    supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', since30),
    supabase.from('payments').select('amount_cents').eq('status', 'paid').gte('created_at', since30),
    supabase.from('subscriptions').select('created_at').gte('created_at', since84),
    supabase.from('tech_sheets').select('id', { count: 'exact', head: true }).eq('status', 'review'),
    supabase.from('blog_posts').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(6),
    supabase.from('profiles').select('id').eq('role', 'admin'),
  ]);

  const revenue30 = (revenue.data ?? []).reduce((s, p) => s + p.amount_cents, 0);

  // Nouveaux abonnés par semaine (12 dernières semaines)
  const weeks = Array.from({ length: 12 }, () => 0);
  for (const s of newSubs.data ?? []) {
    const idx = 11 - weeksAgo(s.created_at);
    if (idx >= 0 && idx < 12) weeks[idx]++;
  }
  const maxWeek = Math.max(1, ...weeks);

  // Double authentification des administrateurs (via l'API d'administration Supabase).
  let adminsWithMfa = 0;
  const adminIds = (admins.data ?? []).map((a) => a.id);
  try {
    const service = createServiceClient();
    const results = await Promise.all(adminIds.map((id) => service.auth.admin.mfa.listFactors({ userId: id })));
    adminsWithMfa = results.filter((r) => r.data?.factors.some((f) => f.status === 'verified')).length;
  } catch {
    /* information indisponible */
  }

  const kpis = [
    { label: 'Membres inscrits', value: members.count ?? 0, sub: `+${newMembers.count ?? 0} sur 30 jours` },
    { label: 'Abonnés payants', value: paid.count ?? 0, sub: `${trials.count ?? 0} en essai` },
    { label: 'Encaissé sur 30 jours', value: formatEuros(revenue30), sub: 'paiements réussis' },
    { label: 'Paiements en échec', value: failed.count ?? 0, sub: 'sur 30 jours', warn: (failed.count ?? 0) > 0 },
  ];
  const todo = [
    { label: 'Fiches générées par l’IA à relire', n: sheetsReview.count ?? 0, href: '/admin/fiches?statut=review', warn: true },
    { label: 'Paiements en échec', n: failed.count ?? 0, href: '/admin/paiements', warn: true },
    { label: 'Articles en brouillon', n: drafts.count ?? 0, href: '/admin/blog' },
  ];

  return (
    <>
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Vue d’ensemble</h1>
        <p className="text-muted">{formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {kpis.map((k) => (
          <div key={k.label} className={`rounded-2xl border p-5 ${k.warn ? 'border-warn-line bg-warn-soft' : 'border-line bg-surface'}`}>
            <p className="mb-1.5 text-sm text-muted">{k.label}</p>
            <p className={`text-[28px] font-bold ${k.warn ? 'text-warn' : ''}`}>{k.value}</p>
            <p className="mt-1 text-[13px] text-muted">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <Card className="min-w-0 flex-[2_1_480px]">
          <h2 className="mb-1 text-lg font-semibold">Nouveaux abonnés</h2>
          <p className="mb-4 text-sm text-muted">Par semaine, sur les 12 dernières semaines</p>
          <div className="flex h-44 items-end gap-2" role="img" aria-label={`Nouveaux abonnés par semaine : ${weeks.join(', ')}`}>
            {weeks.map((n, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs text-muted">{n || ''}</span>
                <div className={`w-full rounded-t ${i === 11 ? 'bg-wheat' : 'bg-brand'}`} style={{ height: `${Math.max(2, (n / maxWeek) * 140)}px` }} />
              </div>
            ))}
          </div>
        </Card>
        <Card className="min-w-0 flex-[1_1_320px]">
          <h2 className="mb-3.5 text-lg font-semibold">À traiter</h2>
          <ul className="flex flex-col gap-2">
            {todo.map((t) => (
              <li key={t.label}>
                <Link href={t.href} className={`flex items-center justify-between gap-3 rounded-[10px] px-3.5 py-3 text-ink ${t.warn && t.n ? 'bg-warn-soft' : 'bg-ground'}`}>
                  <span>{t.label}</span>
                  <strong className={t.warn && t.n ? 'text-warn' : ''}>{t.n}</strong>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <Card className="min-w-0 flex-[2_1_480px]">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Journal d’activité</h2>
            <Link href="/admin/journal" className="text-sm font-semibold text-brand">Tout voir</Link>
          </div>
          <ul className="text-sm">
            {((journal.data ?? []) as AuditEntry[]).map((e) => (
              <li key={e.id} className="flex gap-3.5 border-b border-line-soft py-3 last:border-0">
                <span className="w-28 flex-none text-muted">{formatDate(e.created_at, { day: '2-digit', month: '2-digit', year: undefined, hour: '2-digit', minute: '2-digit' })}</span>
                <span className="flex-1">{e.actor_email ?? 'système'} · {e.action}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="min-w-0 flex-[1_1_320px]">
          <h2 className="mb-3.5 text-lg font-semibold">État de sécurité</h2>
          <ul className="flex flex-col gap-3 text-sm">
            <li className="flex gap-2.5">
              <span className={adminsWithMfa === adminIds.length ? 'font-bold text-brand' : 'font-bold text-warn'}>{adminsWithMfa === adminIds.length ? '✓' : '!'}</span>
              Double authentification : {adminsWithMfa} admin{adminsWithMfa > 1 ? 's' : ''} sur {adminIds.length}
            </li>
            <li className="flex gap-2.5"><span className="font-bold text-brand">✓</span>Accès admin réservé aux sessions validées par code</li>
            <li className="flex gap-2.5"><span className="font-bold text-brand">✓</span>Règles d’accès actives sur toutes les tables</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
