import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { CATALOG_DAILY_BUDGET_USD, CATALOG_PARALLEL, CATALOG_STATUSES, TRACTOR_BRANDS, type CatalogModel, type CatalogStatus } from '@/lib/catalog-shared';
import { spentTodayUsd } from '@/lib/catalog';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Card, Field, Input } from '@/components/ui';
import { listModels, updateSelection } from './actions';
import { AutoRefresh, CostEstimate, KickButton, SelectAll } from './catalog-client';

export const metadata = { title: 'Import par marque' };
// La recherche des modèles d'une marque peut prendre 2 à 3 minutes.
export const maxDuration = 300;

const tone: Record<CatalogStatus, 'green' | 'amber' | 'blue' | 'red' | 'gray'> = {
  todo: 'gray',
  queued: 'blue',
  researching: 'blue',
  researched: 'blue',
  writing: 'blue',
  done: 'green',
  error: 'red',
};

export default async function CatalogPage(props: PageProps<'/admin/fiches/catalogue'>) {
  await requireAdmin('/admin/fiches/catalogue');
  const { marque, statut } = await props.searchParams;
  const brandFilter = typeof marque === 'string' ? marque.slice(0, 60) : undefined;
  const statusFilter = typeof statut === 'string' && statut in CATALOG_STATUSES ? (statut as CatalogStatus) : undefined;

  const supabase = await createClient();
  let query = supabase
    .from('catalog_models')
    .select('id, brand, series, model, years, power_hp, source_url, status, error, sheet_id, photo_status, updated_at')
    .order('brand')
    .order('series')
    .order('power_hp', { ascending: true, nullsFirst: false })
    .limit(500);
  if (brandFilter) query = query.ilike('brand', brandFilter);
  if (statusFilter) query = query.eq('status', statusFilter);
  const [{ data }, { data: all }, used] = await Promise.all([query, supabase.from('catalog_models').select('brand, status'), spentTodayUsd()]);
  const models = (data ?? []) as Pick<CatalogModel, 'id' | 'brand' | 'series' | 'model' | 'years' | 'power_hp' | 'source_url' | 'status' | 'error' | 'sheet_id' | 'photo_status' | 'updated_at'>[];

  const counts = (all ?? []).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  const brands = [...new Set((all ?? []).map((r) => r.brand))].sort((a, b) => a.localeCompare(b, 'fr'));
  const inProgress = (counts.queued ?? 0) + (counts.researching ?? 0) + (counts.researched ?? 0) + (counts.writing ?? 0);
  const working = (counts.researching ?? 0) + (counts.writing ?? 0);

  // Regroupement par marque puis par série pour la lecture.
  const groups = new Map<string, typeof models>();
  for (const m of models) {
    const key = `${m.brand}${m.series ? ` · ${m.series}` : ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  const filterLink = (params: { marque?: string; statut?: string }) => {
    const sp = new URLSearchParams();
    const m = 'marque' in params ? params.marque : brandFilter;
    const s = 'statut' in params ? params.statut : statusFilter;
    if (m) sp.set('marque', m);
    if (s) sp.set('statut', s);
    const qs = sp.toString();
    return `/admin/fiches/catalogue${qs ? `?${qs}` : ''}`;
  };
  const chip = (active: boolean) => `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-brand text-on-brand' : 'border border-field bg-surface hover:border-brand'}`;

  return (
    <>
      <AutoRefresh active={inProgress > 0} />
      <Link href="/admin/fiches" className="text-sm text-brand">← Toutes les fiches</Link>
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Import des tracteurs par marque</h1>
        <p className="max-w-3xl text-muted">
          Claude liste les modèles d’une marque, puis rédige chaque fiche à partir des sites des constructeurs et de la presse spécialisée, en citant ses sources.
          Les fiches arrivent dans « À relire » : rien n’est publié sans votre validation.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:[grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        {(['todo', 'queued', 'researching', 'writing', 'done', 'error'] as const).map((s) => {
          const n = s === 'researching' ? (counts.researching ?? 0) + (counts.researched ?? 0) : counts[s] ?? 0;
          return (
            <Link key={s} href={filterLink({ statut: statusFilter === s ? undefined : s })} className={`rounded-xl border bg-surface p-4 text-ink transition-shadow hover:shadow-md ${statusFilter === s ? 'border-brand ring-2 ring-brand/30' : 'border-line'}`}>
              <p className="text-sm text-muted">{CATALOG_STATUSES[s]}</p>
              <p className="text-2xl font-bold tabular-nums">{n}</p>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <Card className="min-w-0 flex-[1_1_320px]">
          <h2 className="mb-1 text-lg font-semibold">1. Lister les modèles d’une marque</h2>
          <p className="mb-4 text-sm text-muted">Claude parcourt le site du constructeur. Comptez 1 à 3 minutes.</p>
          <ActionForm action={listModels}>
            <Field label="Marque" htmlFor="brand">
              <Input id="brand" name="brand" list="brands" required maxLength={60} placeholder="Ex. : Deutz-Fahr" autoComplete="off" />
            </Field>
            <datalist id="brands">
              {TRACTOR_BRANDS.map((b) => <option key={b.name} value={b.name}>{b.note}</option>)}
            </datalist>
            <Field label="Périmètre" htmlFor="scope" hint="Laissez vide pour la gamme actuelle. Les marques disparues (Renault, Fiat…) : précisez les années.">
              <Input id="scope" name="scope" list="scopes" maxLength={120} placeholder="Ex. : série 6, ou modèles 1990-2010" />
            </Field>
            <datalist id="scopes">
              <option value="Gamme actuelle" />
              <option value="Toutes les séries vendues depuis 2010" />
              <option value="Modèles des années 2000" />
              <option value="Modèles des années 1980 et 1990" />
            </datalist>
            <SubmitButton pendingLabel="Claude parcourt les sites… (1 à 3 min)">✦ Lister les modèles</SubmitButton>
          </ActionForm>
        </Card>

        <Card className="min-w-0 flex-[1_1_320px]">
          <h2 className="mb-1 text-lg font-semibold">3. Génération automatique</h2>
          <p className="mb-4 text-sm text-muted">
            La file tourne sur le serveur, même page fermée ({CATALOG_PARALLEL} étapes en parallèle). Une seule recherche web par série, réutilisée pour chaque modèle. Pause automatique quand le budget du jour est atteint.
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-ground p-3">
              <dt className="text-muted">En cours / en attente</dt>
              <dd className="text-xl font-bold tabular-nums">{working} / {inProgress}</dd>
            </div>
            <div className="rounded-lg bg-ground p-3">
              <dt className="text-muted">Dépense IA aujourd’hui</dt>
              <dd className={`text-xl font-bold tabular-nums ${used >= CATALOG_DAILY_BUDGET_USD ? 'text-danger' : ''}`}>
                {used.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} $ <span className="text-sm font-medium text-muted">/ {CATALOG_DAILY_BUDGET_USD} $</span>
              </dd>
            </div>
          </dl>
          {inProgress > 0 ? (
            <p className="mt-3 flex items-center justify-between gap-3 text-sm text-muted">
              <span className="flex items-center gap-2"><span className="spinner text-brand" aria-hidden="true" /> La page se met à jour toute seule.</span>
              <KickButton />
            </p>
          ) : null}
        </Card>
      </div>

      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <h2 className="text-lg font-semibold">2. Choisir les modèles à générer</h2>
          <nav aria-label="Filtrer par marque" className="flex flex-wrap gap-1.5">
            <Link href={filterLink({ marque: undefined })} className={chip(!brandFilter)}>Toutes</Link>
            {brands.map((b) => <Link key={b} href={filterLink({ marque: b })} className={chip(brandFilter?.toLowerCase() === b.toLowerCase())}>{b}</Link>)}
          </nav>
        </div>

        {models.length === 0 ? (
          <p className="p-5 text-muted">Aucun modèle pour l’instant : commencez par lister une marque.</p>
        ) : (
          <ActionForm action={updateSelection} resetOnSuccess className="flex flex-col" id="catalog">
            <div className="overflow-x-auto">
              <table className="mt-3 w-full border-collapse text-sm sm:min-w-[720px]">
                <thead>
                  <tr className="text-left text-[13px] text-muted">
                    <th className="w-10 border-b border-line px-4 py-2.5"><SelectAll formId="catalog" /></th>
                    {['Modèle', 'Années', 'Puissance', 'Statut', ''].map((h) => <th key={h} className={`border-b border-line px-3 py-2.5 font-medium ${h === 'Années' || h === 'Puissance' ? 'hidden sm:table-cell' : ''}`}>{h}</th>)}
                  </tr>
                </thead>
                {[...groups].map(([group, rows]) => (
                  <tbody key={group}>
                    <tr>
                      <th colSpan={6} className="bg-surface-2 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">{group}</th>
                    </tr>
                    {rows.map((m) => {
                      const busy = ['researching', 'researched', 'writing', 'queued'].includes(m.status);
                      return (
                        <tr key={m.id} className="transition-colors hover:bg-brand-tint/50">
                          <td className="border-b border-line-soft px-4 py-2.5">
                            <input type="checkbox" name="ids" value={m.id} data-series={`${m.brand}|${m.series || m.model}`} disabled={busy} aria-label={`Sélectionner ${m.brand} ${m.model}`} className="size-4 accent-brand" />
                          </td>
                          <td className="border-b border-line-soft px-3 py-2.5 font-semibold">
                            {m.model}
                            {m.source_url ? <a href={m.source_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs font-normal text-muted hover:text-brand">source ↗</a> : null}
                            {m.power_hp || m.years ? <span className="block text-xs font-normal text-muted sm:hidden">{[m.power_hp ? `${m.power_hp} ch` : null, m.years].filter(Boolean).join(' · ')}</span> : null}
                          </td>
                          <td className="hidden border-b border-line-soft px-3 py-2.5 text-muted sm:table-cell">{m.years || '—'}</td>
                          <td className="hidden border-b border-line-soft px-3 py-2.5 tabular-nums sm:table-cell">{m.power_hp ? `${m.power_hp} ch` : '—'}</td>
                          <td className="border-b border-line-soft px-3 py-2.5">
                            <Badge tone={tone[m.status]}>{busy && m.status !== 'queued' ? <span className="spinner mr-1.5 size-3" aria-hidden="true" /> : null}{CATALOG_STATUSES[m.status]}</Badge>
                            {m.error ? <p className="mt-1 max-w-xs text-xs text-danger">{m.error}</p> : null}
                          </td>
                          <td className="border-b border-line-soft px-3 py-2.5 text-right">
                            {m.photo_status === 'found' ? <span className="mr-3 hidden text-xs text-muted sm:inline" title="Photo libre trouvée">📷 photo</span> : m.photo_status === 'none' ? <span className="mr-3 hidden text-xs text-muted sm:inline" title="Aucune photo libre : illustration affichée">sans photo</span> : null}
                            {m.sheet_id ? <Link href={`/admin/fiches/${m.sheet_id}`} className="font-semibold text-brand hover:text-brand-dark">Relire →</Link> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur">
              <CostEstimate formId="catalog" />
              <div className="flex flex-wrap gap-2.5">
                <SubmitButton name="intent" value="remove" variant="secondary" pendingLabel="…">Retirer de la liste</SubmitButton>
                <SubmitButton name="intent" value="queue" pendingLabel="Mise en file…">✦ Générer les fiches sélectionnées</SubmitButton>
              </div>
            </div>
          </ActionForm>
        )}
      </section>
    </>
  );
}
