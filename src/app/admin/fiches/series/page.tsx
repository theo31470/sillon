import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { countPendingReview, parseSheetContent } from '@/lib/sheets/schema';
import { Badge } from '@/components/ui';
import { seriesHref, sheetQuality } from './shared';

export const metadata = { title: 'Relecture par série' };

type Row = {
  brand: string;
  series: string;
  sheet: { id: string; status: string; content: unknown; cover_url: string | null } | null;
};

export default async function SeriesListPage(props: PageProps<'/admin/fiches/series'>) {
  await requireAdmin('/admin/fiches/series');
  const { tout } = await props.searchParams;
  const showAll = tout === '1';
  const supabase = await createClient();
  const { data } = await supabase
    .from('catalog_models')
    .select('brand, series, sheet:tech_sheets!catalog_models_sheet_id_fkey(id, status, content, cover_url)')
    .not('sheet_id', 'is', null)
    .order('brand')
    .order('series')
    .limit(2000);
  const rows = (data ?? []) as unknown as Row[];

  type Agg = { brand: string; series: string; review: number; published: number; rejected: number; pending: number; photos: number; thin: number; total: number };
  const map = new Map<string, Agg>();
  for (const r of rows) {
    if (!r.sheet) continue;
    const key = `${r.brand}\u0000${r.series}`;
    const a = map.get(key) ?? { brand: r.brand, series: r.series, review: 0, published: 0, rejected: 0, pending: 0, photos: 0, thin: 0, total: 0 };
    a.total++;
    const content = parseSheetContent(r.sheet.content);
    if (r.sheet.status === 'review' || r.sheet.status === 'validated') {
      a.review++;
      a.pending += countPendingReview(content);
      if (sheetQuality(content) === 'mince') a.thin++;
    }
    if (r.sheet.status === 'published') a.published++;
    if (r.sheet.status === 'rejected') a.rejected++;
    if (r.sheet.cover_url) a.photos++;
    map.set(key, a);
  }
  const all = [...map.values()];
  const list = showAll ? all : all.filter((a) => a.review > 0);
  const brands = [...new Set(list.map((a) => a.brand))];
  const toReview = all.reduce((s, a) => s + a.review, 0);
  const seriesToReview = all.filter((a) => a.review > 0).length;

  return (
    <>
      <Link href="/admin/fiches" className="text-sm text-brand">← Toutes les fiches</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Relecture par série</h1>
          <p className="max-w-3xl text-muted">
            Les modèles d’une même série partagent l’essentiel : comparez-les côte à côte, les écarts sautent aux yeux. Publiez ensuite toute la série en une fois,
            en laissant de côté les fiches qui ne vous conviennent pas.
          </p>
        </div>
        <Link href={showAll ? '/admin/fiches/series' : '/admin/fiches/series?tout=1'} className="text-sm font-semibold text-brand">
          {showAll ? 'Seulement les séries à relire' : 'Afficher aussi les séries terminées'}
        </Link>
      </div>

      <p className="text-sm text-muted">
        <strong className="text-ink">{toReview}</strong> fiche{toReview > 1 ? 's' : ''} à relire dans <strong className="text-ink">{seriesToReview}</strong> série{seriesToReview > 1 ? 's' : ''}.
      </p>

      {brands.length === 0 ? <p className="rounded-xl border border-line bg-surface p-6 text-muted">Aucune série à relire pour le moment.</p> : null}

      {brands.map((brand) => (
        <section key={brand} className="overflow-hidden rounded-2xl border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-3 text-lg font-semibold">{brand}</h2>
          <ul>
            {list
              .filter((a) => a.brand === brand)
              .map((a) => (
                <li key={a.series} className="border-b border-line-soft last:border-b-0">
                  <Link href={seriesHref(a.brand, a.series)} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5 text-ink hover:bg-ground">
                    <span className="min-w-0 flex-[1_1_220px] font-semibold">{a.series || 'Sans série'}</span>
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      {a.review ? <Badge tone="amber">{a.review} à relire</Badge> : null}
                      {a.published ? <Badge tone="green">{a.published} publiée{a.published > 1 ? 's' : ''}</Badge> : null}
                      {a.rejected ? <Badge tone="red">{a.rejected} rejetée{a.rejected > 1 ? 's' : ''}</Badge> : null}
                      {a.thin ? <Badge tone="gray">{a.thin} incomplète{a.thin > 1 ? 's' : ''}</Badge> : null}
                    </span>
                    <span className="w-full text-sm text-muted sm:w-auto">
                      {a.review ? `${Math.round(a.pending / a.review)} points à vérifier par fiche · ` : ''}
                      photos {a.photos}/{a.total}
                    </span>
                    <span aria-hidden="true" className="hidden text-brand sm:inline">→</span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}
