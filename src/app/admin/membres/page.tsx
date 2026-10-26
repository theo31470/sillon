import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/admin';
import { COUNTED, FILTERS, MembersListView, SORTS, type Filter, type MemberRow, type Sort } from './list-view';

export const metadata: Metadata = { title: 'Membres' };
export const dynamic = 'force-dynamic';
const PAGE = 25;

export default async function MembersPage(props: PageProps<'/admin/membres'>) {
  await requireAdmin('/admin/membres');
  const sp = await props.searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 80).replace(/[%_\\]/g, '') : '';
  const filtre: Filter = typeof sp.filtre === 'string' && sp.filtre in FILTERS ? (sp.filtre as Filter) : 'tous';
  const tri: Sort = typeof sp.tri === 'string' && sp.tri in SORTS ? (sp.tri as Sort) : 'recent';
  const etiquette = typeof sp.etiquette === 'string' ? sp.etiquette.slice(0, 30) : '';
  const page = Math.max(0, Number(sp.page) || 0);

  // Liste et compteurs calculés en base, après la vérification admin ci-dessus.
  const service = createServiceClient();
  const countOf = async (f: Filter) => {
    const { data } = await service.rpc('admin_member_list', { p_filtre: f, p_limit: 1 });
    return Number((data as MemberRow[] | null)?.[0]?.total_count ?? 0);
  };
  const [{ data, error }, { data: tagRows }, ...countValues] = await Promise.all([
    service.rpc('admin_member_list', { p_q: q, p_filtre: filtre, p_tag: etiquette, p_sort: tri, p_offset: page * PAGE, p_limit: PAGE }),
    service.rpc('admin_member_tags'),
    ...COUNTED.map(countOf),
  ]);
  if (error) console.error('[admin membres]', error.message);
  const rows = (data ?? []) as MemberRow[];

  return (
    <MembersListView
      rows={rows}
      total={Number(rows[0]?.total_count ?? 0)}
      counts={Object.fromEntries(COUNTED.map((k, i) => [k, countValues[i] as number]))}
      tags={(tagRows ?? []) as { tag: string; n: number }[]}
      q={q}
      filtre={filtre}
      tri={tri}
      etiquette={etiquette}
      page={page}
      pageSize={PAGE}
      deleted={Boolean(sp.supprime)}
    />
  );
}
