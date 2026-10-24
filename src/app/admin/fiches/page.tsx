import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import { countPendingReview, parseSheetContent } from '@/lib/sheets/schema';
import { SHEET_CATEGORIES, SHEET_STATUSES, type SheetStatus, type TechSheet } from '@/lib/types';
import { Badge, Card } from '@/components/ui';
import { NewSheetForm } from './new-sheet-form';

export const metadata = { title: 'Fiches techniques' };

const tone: Record<SheetStatus, 'green' | 'amber' | 'blue' | 'red' | 'gray'> = {
  generating: 'blue',
  review: 'amber',
  validated: 'gray',
  published: 'green',
  rejected: 'red',
};

export default async function AdminSheetsPage(props: PageProps<'/admin/fiches'>) {
  await requireAdmin('/admin/fiches');
  const { statut } = await props.searchParams;
  const filter = typeof statut === 'string' && statut in SHEET_STATUSES ? (statut as SheetStatus) : undefined;
  const supabase = await createClient();
  let query = supabase.from('tech_sheets').select('id, slug, title, category, status, content, updated_at, validated_by').order('updated_at', { ascending: false });
  if (filter) query = query.eq('status', filter);
  const [{ data }, { data: all }] = await Promise.all([query, supabase.from('tech_sheets').select('status')]);
  const sheets = (data ?? []) as Pick<TechSheet, 'id' | 'slug' | 'title' | 'category' | 'status' | 'content' | 'updated_at' | 'validated_by'>[];
  const counts = (all ?? []).reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.status]: (acc[s.status] ?? 0) + 1 }), {});

  return (
    <>
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Fiches techniques</h1>
        <p className="text-muted">Rédigées par Claude à partir de vos documents, validées par un humain avant publication.</p>
      </div>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        {(['generating', 'review', 'published', 'rejected'] as const).map((s) => (
          <Link key={s} href={`/admin/fiches?statut=${s}`} className={`rounded-xl border p-4 text-ink ${s === 'review' && counts[s] ? 'border-warn-line bg-warn-soft' : 'border-line bg-white'} ${filter === s ? 'ring-2 ring-brand' : ''}`}>
            <p className="text-sm text-muted">{SHEET_STATUSES[s]}</p>
            <p className="text-2xl font-bold">{counts[s] ?? 0}</p>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <Card className="min-w-0 flex-[1_1_320px]">
          <h2 className="mb-3.5 text-lg font-semibold">Générer une fiche avec Claude</h2>
          <NewSheetForm />
        </Card>

        <section className="min-w-0 flex-[2_1_560px] overflow-x-auto rounded-2xl border border-line bg-white">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="text-lg font-semibold">{filter ? SHEET_STATUSES[filter] : 'Toutes les fiches'}</h2>
            {filter ? <Link href="/admin/fiches" className="text-sm font-semibold text-brand">Tout afficher</Link> : null}
          </div>
          <table className="mt-3 w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[13px] text-muted">
                {['Fiche', 'Type', 'Statut', 'À vérifier', 'Mise à jour'].map((h) => <th key={h} className="border-b border-line px-4 py-2.5 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {sheets.map((s) => {
                const pending = countPendingReview(parseSheetContent(s.content));
                return (
                  <tr key={s.id}>
                    <td className="border-b border-[#eef0eb] px-4 py-3 font-semibold"><Link href={`/admin/fiches/${s.id}`} className="text-ink hover:text-brand">{s.title}</Link></td>
                    <td className="border-b border-[#eef0eb] px-4 py-3">{SHEET_CATEGORIES[s.category]}</td>
                    <td className="border-b border-[#eef0eb] px-4 py-3"><Badge tone={tone[s.status]}>{SHEET_STATUSES[s.status]}</Badge></td>
                    <td className="border-b border-[#eef0eb] px-4 py-3">{pending ? <span className="font-semibold text-warn">{pending}</span> : '—'}</td>
                    <td className="border-b border-[#eef0eb] px-4 py-3">{formatDate(s.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sheets.length === 0 ? <p className="p-5 text-muted">Aucune fiche.</p> : null}
        </section>
      </div>
    </>
  );
}
