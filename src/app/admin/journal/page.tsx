import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import type { AuditEntry } from '@/lib/types';

export const metadata = { title: 'Journal d’activité' };
const PAGE = 50;

export default async function JournalPage(props: PageProps<'/admin/journal'>) {
  await requireAdmin('/admin/journal');
  const { page } = await props.searchParams;
  const p = Math.max(0, Number(page) || 0);
  const supabase = await createClient();
  const { data } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .range(p * PAGE, p * PAGE + PAGE - 1);
  const rows = (data ?? []) as AuditEntry[];

  return (
    <>
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Journal d’activité</h1>
        <p className="text-muted">Toutes les actions sensibles. Le journal ne peut être ni modifié ni effacé depuis le site.</p>
      </div>
      <section className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[13px] text-muted">
              {['Date', 'Qui', 'Action', 'Cible', 'Détails', 'IP'].map((h) => <th key={h} className="border-b border-line px-4 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="border-b border-line-soft px-4 py-3 whitespace-nowrap">{formatDate(e.created_at, { hour: '2-digit', minute: '2-digit' })}</td>
                <td className="border-b border-line-soft px-4 py-3">{e.actor_email ?? 'système'}</td>
                <td className="border-b border-line-soft px-4 py-3 font-medium">{e.action}</td>
                <td className="border-b border-line-soft px-4 py-3 text-muted">{e.target_type ? `${e.target_type} ${e.target_id?.slice(0, 8)}` : '—'}</td>
                <td className="border-b border-line-soft px-4 py-3 text-muted"><code className="text-xs">{Object.keys(e.details ?? {}).length ? JSON.stringify(e.details).slice(0, 120) : ''}</code></td>
                <td className="border-b border-line-soft px-4 py-3 text-muted">{e.ip ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="flex gap-3">
        {p > 0 ? <Link href={`/admin/journal?page=${p - 1}`} className="font-semibold text-brand">← Plus récents</Link> : null}
        {rows.length === PAGE ? <Link href={`/admin/journal?page=${p + 1}`} className="font-semibold text-brand">Plus anciens →</Link> : null}
      </div>
    </>
  );
}
