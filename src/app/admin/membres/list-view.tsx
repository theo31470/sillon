import Link from 'next/link';
import { formatDate, maskEmail } from '@/lib/format';
import { PLANS } from '@/lib/plans';
import type { Plan } from '@/lib/types';
import { Badge, Notice, inputClass } from '@/components/ui';
import { AutoSubmitSelect, BulkBar, RowCheckbox, SelectAll } from './bulk-bar';

export const FILTERS = {
  tous: 'Tous les membres',
  payants: 'Payants',
  essai: 'En essai',
  resiliation: 'Résiliation programmée',
  echec: 'Paiement en échec',
  offerts: 'Formule offerte',
  gratuits: 'Gratuits',
  inactifs: 'Inactifs depuis 30 jours',
  suspendus: 'Suspendus',
  admins: 'Administrateurs',
} as const;
export type Filter = keyof typeof FILTERS;

export const SORTS = {
  recent: 'Inscription récente',
  ancien: 'Inscription ancienne',
  activite: 'Dernière activité',
  machines: 'Nombre de machines',
  nom: 'Nom (A → Z)',
} as const;
export type Sort = keyof typeof SORTS;

/** Compteurs affichés en tête (cliquables). */
export const COUNTED: Filter[] = ['tous', 'payants', 'essai', 'offerts', 'echec', 'inactifs'];

export type MemberRow = {
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

function ago(iso: string | null) {
  if (!iso) return '—';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 60) return 'à l’instant';
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d < 60 ? `il y a ${d} j` : formatDate(iso);
}

function Situation({ r }: { r: MemberRow }) {
  if (r.suspended) return <Badge tone="red">Suspendu</Badge>;
  if (r.sub_status === 'past_due' || r.sub_status === 'unpaid') return <Badge tone="red">Paiement en échec</Badge>;
  if (r.sub_cancel_at_period_end && ['trialing', 'active'].includes(r.sub_status ?? '')) return <Badge tone="amber">Résiliation programmée</Badge>;
  if (r.sub_status === 'trialing') return <Badge tone="blue">En essai</Badge>;
  if (r.sub_status === 'active') return <Badge tone="green">Abonné</Badge>;
  if (r.comp_active) return <Badge tone="blue">Offerte</Badge>;
  return <Badge>Gratuit</Badge>;
}

export function MembersListView({
  rows,
  total,
  counts,
  tags,
  q,
  filtre,
  tri,
  etiquette,
  page,
  pageSize,
  deleted,
}: {
  rows: MemberRow[];
  total: number;
  counts: Partial<Record<Filter, number>>;
  tags: { tag: string; n: number }[];
  q: string;
  filtre: Filter;
  tri: Sort;
  etiquette: string;
  page: number;
  pageSize: number;
  deleted?: boolean;
}) {
  const link = (params: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    const merged = { q: q || undefined, filtre: filtre !== 'tous' ? filtre : undefined, tri: tri !== 'recent' ? tri : undefined, etiquette: etiquette || undefined, page: page || undefined, ...params };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== '') u.set(k, String(v));
    const s = u.toString();
    return `/admin/membres${s ? `?${s}` : ''}`;
  };
  const filtered = filtre !== 'tous' || q || etiquette;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Membres</h1>
          <p className="text-muted">Comptes, abonnements et suivi des exploitants.</p>
        </div>
      </div>
      {deleted ? <Notice tone="green">Compte et données supprimés.</Notice> : null}

      {/* Compteurs cliquables */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {COUNTED.map((k) => {
          const active = filtre === k && !q && !etiquette;
          const warn = k === 'echec' && (counts[k] ?? 0) > 0;
          return (
            <Link
              key={k}
              href={link({ filtre: k === 'tous' ? undefined : k, q: undefined, etiquette: undefined, page: undefined })}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col gap-1 rounded-xl border px-4 py-3.5 transition-colors ${
                active ? 'border-brand bg-brand-tint' : warn ? 'border-warn-line bg-warn-soft hover:border-warn' : 'border-line bg-surface hover:border-brand'
              }`}
            >
              <span className="text-[13px] text-muted">{k === 'tous' ? 'Tous' : FILTERS[k].replace(' depuis 30 jours', ' (30 j)')}</span>
              <span className={`text-2xl font-bold tabular-nums ${warn ? 'text-warn' : ''}`}>{counts[k] ?? 0}</span>
            </Link>
          );
        })}
      </div>

      {/* Recherche et filtres */}
      <form action="/admin/membres" className="grid gap-3 rounded-2xl border border-line bg-surface p-4 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <div>
          <label htmlFor="q" className="mb-1.5 block text-sm font-semibold">Rechercher</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Nom, exploitation, e-mail…" className={inputClass} />
        </div>
        <div>
          <label htmlFor="filtre" className="mb-1.5 block text-sm font-semibold">Situation</label>
          <AutoSubmitSelect id="filtre" name="filtre" defaultValue={filtre}>
            {Object.entries(FILTERS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </AutoSubmitSelect>
        </div>
        <div>
          <label htmlFor="etiquette" className="mb-1.5 block text-sm font-semibold">Étiquette</label>
          <AutoSubmitSelect id="etiquette" name="etiquette" defaultValue={etiquette}>
            <option value="">Toutes</option>
            {tags.map((t) => <option key={t.tag} value={t.tag}>{t.tag} ({t.n})</option>)}
          </AutoSubmitSelect>
        </div>
        <div>
          <label htmlFor="tri" className="mb-1.5 block text-sm font-semibold">Trier par</label>
          <AutoSubmitSelect id="tri" name="tri" defaultValue={tri}>
            {Object.entries(SORTS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </AutoSubmitSelect>
        </div>
        <button type="submit" className="sr-only">Filtrer</button>
      </form>

      <BulkBar tags={tags.map((t) => t.tag)} />

      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <p className="font-semibold">
            {total} membre{total > 1 ? 's' : ''}
            {filtered ? <span className="font-normal text-muted"> · {[filtre !== 'tous' ? FILTERS[filtre].toLowerCase() : null, etiquette ? `#${etiquette}` : null, q ? `« ${q} »` : null].filter(Boolean).join(' · ')}</span> : null}
          </p>
          {filtered ? <Link href="/admin/membres" className="text-sm font-semibold text-brand">Effacer les filtres</Link> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="bg-surface-2 text-left text-[13px] text-muted">
                <th className="w-12 border-b border-line px-4 py-3"><SelectAll /></th>
                <th className="border-b border-line px-4 py-3 font-medium">Membre</th>
                <th className="border-b border-line px-4 py-3 font-medium">Formule</th>
                <th className="border-b border-line px-4 py-3 font-medium">Situation</th>
                <th className="border-b border-line px-4 py-3 text-right font-medium">Machines</th>
                <th className="border-b border-line px-4 py-3 font-medium">Dernière activité</th>
                <th className="border-b border-line px-4 py-3 font-medium">Inscription</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const label = m.farm_name || m.full_name || m.email;
                return (
                  <tr key={m.id} className="align-top hover:bg-ground">
                    <td className="border-b border-line-soft px-4 py-3.5"><RowCheckbox id={m.id} label={label} /></td>
                    <td className="border-b border-line-soft px-4 py-3.5">
                      <Link href={`/admin/membres/${m.id}`} className="font-semibold text-ink hover:text-brand">{label}</Link>
                      <p className="text-muted">{m.full_name && m.full_name !== label ? `${m.full_name} · ` : ''}{maskEmail(m.email)}</p>
                      {m.tags.length ? (
                        <p className="mt-1 flex flex-wrap gap-1">
                          {m.tags.map((t) => (
                            <Link key={t} href={link({ etiquette: t, page: undefined })} className="rounded-full bg-ground px-2 py-0.5 text-xs text-muted hover:text-brand">#{t}</Link>
                          ))}
                        </p>
                      ) : null}
                    </td>
                    <td className="border-b border-line-soft px-4 py-3.5">
                      {PLANS[m.plan].name}
                      {m.role === 'admin' ? <span className="text-muted"> · admin</span> : null}
                    </td>
                    <td className="border-b border-line-soft px-4 py-3.5"><Situation r={m} /></td>
                    <td className="border-b border-line-soft px-4 py-3.5 text-right tabular-nums">{m.machine_count}</td>
                    <td className="border-b border-line-soft px-4 py-3.5" title={m.last_seen_at ? formatDate(m.last_seen_at) : undefined}>{ago(m.last_seen_at)}</td>
                    <td className="border-b border-line-soft px-4 py-3.5">{formatDate(m.created_at)}</td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">Aucun membre ne correspond.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {total > pageSize ? (
          <div className="flex items-center justify-between px-4 py-3 text-sm text-muted">
            <span>{page * pageSize + 1}–{page * pageSize + rows.length} sur {total}</span>
            <span className="flex gap-3">
              {page > 0 ? <Link href={link({ page: page - 1 })} className="font-semibold text-brand">← Précédent</Link> : null}
              {(page + 1) * pageSize < total ? <Link href={link({ page: page + 1 })} className="font-semibold text-brand">Suivant →</Link> : null}
            </span>
          </div>
        ) : null}
      </section>
    </>
  );
}
