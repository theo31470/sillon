import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/admin';
import { formatDate, maskEmail } from '@/lib/format';
import { PLANS } from '@/lib/plans';
import type { Plan } from '@/lib/types';
import { Badge, Notice, inputClass } from '@/components/ui';
import { AutoSubmitSelect, BulkBar, RowCheckbox, SelectAll } from './bulk-bar';

export const metadata: Metadata = { title: 'Membres' };
export const dynamic = 'force-dynamic';
const PAGE = 25;

const FILTERS = {
  tous: 'Tous',
  payants: 'Payants',
  essai: 'En essai',
  resiliation: 'Résiliation programmée',
  echec: 'Paiement en échec',
  offerts: 'Formule offerte',
  gratuits: 'Gratuits',
  inactifs: 'Inactifs (30 j)',
  suspendus: 'Suspendus',
  admins: 'Admins',
} as const;
const SORTS = {
  recent: 'Inscription récente',
  ancien: 'Inscription ancienne',
  activite: 'Dernière activité',
  machines: 'Nombre de machines',
  nom: 'Nom (A → Z)',
} as const;

type Row = {
  id: string;
  email: string;
  full_name: string;
  farm_name: string;
  role: string;
  plan: Plan;
  suspended: boolean;
  comp_active: boolean;
  comp_until: string | null;
  created_at: string;
  last_seen_at: string | null;
  machine_count: number;
  tags: string[];
  sub_status: string | null;
  sub_cancel_at_period_end: boolean;
  total_count: number;
};

/** « il y a 3 j » pour la dernière activité. */
function ago(iso: string | null) {
  if (!iso) return '—';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 60) return 'à l’instant';
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 60) return `il y a ${d} j`;
  return formatDate(iso);
}

function SubBadge({ r }: { r: Row }) {
  if (r.sub_status === 'past_due' || r.sub_status === 'unpaid') return <Badge tone="red">Paiement en échec</Badge>;
  if (r.sub_cancel_at_period_end && ['trialing', 'active'].includes(r.sub_status ?? '')) return <Badge tone="amber">Résiliation</Badge>;
  if (r.sub_status === 'trialing') return <Badge tone="blue">Essai</Badge>;
  if (r.comp_active) return <Badge tone="blue">Offerte</Badge>;
  return null;
}

export default async function MembersPage(props: PageProps<'/admin/membres'>) {
  await requireAdmin('/admin/membres');
  const sp = await props.searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 80).replace(/[%_\\]/g, '') : '';
  const filtre = typeof sp.filtre === 'string' && sp.filtre in FILTERS ? (sp.filtre as keyof typeof FILTERS) : 'tous';
  const tri = typeof sp.tri === 'string' && sp.tri in SORTS ? (sp.tri as keyof typeof SORTS) : 'recent';
  const etiquette = typeof sp.etiquette === 'string' ? sp.etiquette.slice(0, 30) : '';
  const page = Math.max(0, Number(sp.page) || 0);

  // Liste calculée en base (filtres, tri, nombre de machines), après vérification admin ci-dessus.
  const service = createServiceClient();
  const [{ data, error }, { data: tagRows }] = await Promise.all([
    service.rpc('admin_member_list', { p_q: q, p_filtre: filtre, p_tag: etiquette, p_sort: tri, p_offset: page * PAGE, p_limit: PAGE }),
    service.rpc('admin_member_tags'),
  ]);
  if (error) console.error('[admin membres]', error.message);
  const rows = (data ?? []) as Row[];
  const total = Number(rows[0]?.total_count ?? 0);
  const tags = ((tagRows ?? []) as { tag: string; n: number }[]);

  const link = (params: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    const merged = { q: q || undefined, filtre: filtre !== 'tous' ? filtre : undefined, tri: tri !== 'recent' ? tri : undefined, etiquette: etiquette || undefined, page: page || undefined, ...params };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== '') u.set(k, String(v));
    const s = u.toString();
    return `/admin/membres${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Membres</h1>
        <p className="text-muted">
          {total} compte{total > 1 ? 's' : ''}
          {filtre !== 'tous' || q || etiquette ? ' correspondant aux critères' : ''}
        </p>
      </div>
      {sp.supprime ? <Notice tone="green">Compte et données supprimés.</Notice> : null}

      <form className="flex flex-wrap items-end gap-3" action="/admin/membres">
        <div className="w-full max-w-sm">
          <label htmlFor="q" className="mb-1.5 block text-sm font-semibold">Rechercher</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Nom, exploitation, e-mail…" className={inputClass} />
        </div>
        <div className="min-w-44">
          <label htmlFor="etiquette" className="mb-1.5 block text-sm font-semibold">Étiquette</label>
          <AutoSubmitSelect id="etiquette" name="etiquette" defaultValue={etiquette}>
            <option value="">Toutes</option>
            {tags.map((t) => <option key={t.tag} value={t.tag}>{t.tag} ({t.n})</option>)}
          </AutoSubmitSelect>
        </div>
        <div className="min-w-52">
          <label htmlFor="tri" className="mb-1.5 block text-sm font-semibold">Trier par</label>
          <AutoSubmitSelect id="tri" name="tri" defaultValue={tri}>
            {Object.entries(SORTS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </AutoSubmitSelect>
        </div>
        {filtre !== 'tous' ? <input type="hidden" name="filtre" value={filtre} /> : null}
        <button type="submit" className="sr-only">Filtrer</button>
      </form>

      <nav aria-label="Filtres" className="flex flex-wrap gap-2">
        {Object.entries(FILTERS).map(([k, label]) => (
          <Link
            key={k}
            href={link({ filtre: k === 'tous' ? undefined : k, page: undefined })}
            aria-current={filtre === k ? 'page' : undefined}
            className={`rounded-full px-3.5 py-2 text-[15px] ${filtre === k ? 'bg-admin font-semibold text-white' : 'border border-field bg-surface'}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <BulkBar tags={tags.map((t) => t.tag)} />

      <section className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[13px] text-muted">
              <th className="w-10 border-b border-line px-4 py-3"><SelectAll /></th>
              {['Exploitation', 'Formule', 'Machines', 'Dernière activité', 'Inscrit le', 'Statut'].map((h) => (
                <th key={h} className="border-b border-line px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const label = m.farm_name || m.full_name || m.email;
              return (
                <tr key={m.id} className="hover:bg-ground">
                  <td className="border-b border-line-soft px-4 py-3.5"><RowCheckbox id={m.id} label={label} /></td>
                  <td className="border-b border-line-soft px-4 py-3.5">
                    <Link href={`/admin/membres/${m.id}`} className="block text-ink">
                      <strong className="font-semibold">{label}</strong>
                      <br />
                      <span className="text-muted">{m.full_name ? `${m.full_name} · ` : ''}{maskEmail(m.email)}</span>
                    </Link>
                    {m.tags.length ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {m.tags.map((t) => (
                          <Link key={t} href={link({ etiquette: t, page: undefined })} className="rounded-full bg-ground px-2 py-0.5 text-xs text-muted hover:text-brand">#{t}</Link>
                        ))}
                      </span>
                    ) : null}
                  </td>
                  <td className="border-b border-line-soft px-4 py-3.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {PLANS[m.plan].name}
                      {m.role === 'admin' ? <span className="text-muted">· admin</span> : null}
                      <SubBadge r={m} />
                    </span>
                  </td>
                  <td className="border-b border-line-soft px-4 py-3.5 tabular-nums">{m.machine_count}</td>
                  <td className="border-b border-line-soft px-4 py-3.5" title={m.last_seen_at ? formatDate(m.last_seen_at) : undefined}>{ago(m.last_seen_at)}</td>
                  <td className="border-b border-line-soft px-4 py-3.5">{formatDate(m.created_at)}</td>
                  <td className="border-b border-line-soft px-4 py-3.5">{m.suspended ? <Badge tone="red">Suspendu</Badge> : <Badge tone="green">Actif</Badge>}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">Aucun membre ne correspond.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-3 text-sm text-muted">
          <span>{rows.length ? `${page * PAGE + 1}–${page * PAGE + rows.length} sur ${total}` : ''}</span>
          <span className="flex gap-3">
            {page > 0 ? <Link href={link({ page: page - 1 })} className="font-semibold text-brand">Précédent</Link> : null}
            {(page + 1) * PAGE < total ? <Link href={link({ page: page + 1 })} className="font-semibold text-brand">Suivant</Link> : null}
          </span>
        </div>
      </section>
    </>
  );
}
