import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import { REQUEST_STATUSES, type RequestStatus, type SheetRequest } from '@/lib/sheet-requests';
import { CATALOG_STATUSES, type CatalogStatus } from '@/lib/catalog-shared';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Field, Input } from '@/components/ui';
import { declineRequests, launchRequests, linkRequests } from './actions';

export const metadata = { title: 'Fiches demandées' };

type Row = SheetRequest & {
  member: { id: string; full_name: string; farm_name: string; email: string } | null;
  catalog: { status: CatalogStatus; sheet_id: string | null; series: string } | null;
};

const tone: Record<RequestStatus, 'green' | 'amber' | 'blue' | 'gray'> = { nouvelle: 'amber', lancee: 'blue', publiee: 'green', refusee: 'gray' };
const keyOf = (r: { brand: string; model: string }) => `${r.brand.trim().toLowerCase()}|${r.model.trim().toLowerCase()}`;

export default async function SheetRequestsPage(props: PageProps<'/admin/fiches/demandes'>) {
  await requireAdmin('/admin/fiches/demandes');
  const { tout } = await props.searchParams;
  const showAll = tout === '1';
  const supabase = await createClient();
  let query = supabase
    .from('sheet_requests')
    .select('*, member:profiles!sheet_requests_user_id_fkey(id, full_name, farm_name, email), catalog:catalog_models(status, sheet_id, series)')
    .order('created_at', { ascending: true })
    .limit(500);
  if (!showAll) query = query.in('status', ['nouvelle', 'lancee']);
  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  // Une ligne par modèle demandé, avec le nombre de membres qui l'attendent.
  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r]);
  const list = [...groups.values()].sort((a, b) => b.length - a.length || a[0].created_at.localeCompare(b[0].created_at));

  // Fiches déjà publiées qui pourraient répondre à une demande.
  const { data: published } = await supabase.from('tech_sheets').select('id, title, brand, model').eq('status', 'published');
  const match = (r: Row) =>
    (published ?? []).find((s) => (s.brand as string).toLowerCase() === r.brand.trim().toLowerCase() && (s.model as string).toLowerCase() === r.model.trim().toLowerCase()) ?? null;

  return (
    <>
      <Link href="/admin/fiches" className="text-sm text-brand">← Toutes les fiches</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Fiches demandées par les membres</h1>
          <p className="max-w-3xl text-muted">
            Les membres demandent un modèle absent depuis la page Fiches techniques. Vérifiez la marque et le modèle (complétez la série si vous la connaissez), puis lancez la
            préparation : la fiche passe par la file d’import, arrive dans « À relire », et chaque membre qui l’attendait est prévenu par e-mail à sa publication.
          </p>
        </div>
        <Link href={showAll ? '/admin/fiches/demandes' : '/admin/fiches/demandes?tout=1'} className="text-sm font-semibold text-brand">
          {showAll ? 'Seulement les demandes en cours' : 'Afficher aussi les demandes closes'}
        </Link>
      </div>

      {list.length === 0 ? <p className="rounded-xl border border-line bg-surface p-6 text-muted">Aucune demande en cours.</p> : null}

      <div className="flex flex-col gap-4">
        {list.map((group) => {
          const first = group[0];
          const open = group.filter((r) => r.status === 'nouvelle' || r.status === 'lancee');
          const idsInputs = open.map((r) => <input key={r.id} type="hidden" name="ids" value={r.id} />);
          const existing = match(first);
          const catalog = group.find((r) => r.catalog)?.catalog ?? null;
          return (
            <section key={keyOf(first)} className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">
                    {first.brand} {first.model}
                  </h2>
                  <p className="text-sm text-muted">
                    Demandée par {group.length} membre{group.length > 1 ? 's' : ''} · depuis le {formatDate(first.created_at)}
                  </p>
                </div>
                <span className="flex flex-wrap gap-1.5">
                  <Badge tone={tone[first.status]}>{REQUEST_STATUSES[first.status]}</Badge>
                  {catalog ? <Badge tone={catalog.status === 'error' ? 'red' : catalog.status === 'done' ? 'green' : 'blue'}>Import : {CATALOG_STATUSES[catalog.status]}</Badge> : null}
                </span>
              </div>

              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {group.map((r) => (
                  <li key={r.id} className="flex flex-wrap gap-x-2">
                    {r.member ? (
                      <Link href={`/admin/membres/${r.member.id}`} className="font-semibold text-ink hover:text-brand">
                        {r.member.farm_name || r.member.full_name || r.member.email}
                      </Link>
                    ) : (
                      <span>Compte supprimé</span>
                    )}
                    {r.details ? <span className="text-muted">« {r.details} »</span> : null}
                    {r.status === 'refusee' && r.admin_note ? <span className="text-muted">· refusée : {r.admin_note}</span> : null}
                  </li>
                ))}
              </ul>

              {open.length ? (
                <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
                  {existing ? (
                    <ActionForm action={linkRequests} resetOnSuccess={false} className="flex flex-wrap items-center gap-3">
                      {idsInputs}
                      <input type="hidden" name="sheet_id" value={existing.id as string} />
                      <p className="text-sm">
                        La fiche <Link href={`/admin/fiches/${existing.id}`} className="font-semibold text-brand">{existing.title as string}</Link> est déjà en ligne.
                      </p>
                      <SubmitButton pendingLabel="Envoi…">Prévenir {open.length > 1 ? 'les membres' : 'le membre'}</SubmitButton>
                    </ActionForm>
                  ) : catalog?.sheet_id ? (
                    <p className="text-sm">
                      Fiche en préparation :{' '}
                      <Link href={`/admin/fiches/${catalog.sheet_id}`} className="font-semibold text-brand">
                        relire et publier
                      </Link>{' '}
                      (les membres seront prévenus automatiquement).
                    </p>
                  ) : first.status === 'nouvelle' || catalog?.status === 'error' || !catalog ? (
                    <ActionForm action={launchRequests} resetOnSuccess={false} className="flex flex-col gap-3">
                      {idsInputs}
                      <div className="grid gap-3 sm:grid-cols-4">
                        <Field label="Marque" htmlFor={`b-${first.id}`}>
                          <Input id={`b-${first.id}`} name="brand" defaultValue={first.brand} required maxLength={60} />
                        </Field>
                        <Field label="Série (facultatif)" htmlFor={`s-${first.id}`}>
                          <Input id={`s-${first.id}`} name="series" defaultValue={catalog?.series ?? ''} maxLength={120} placeholder="Ex. : 5700 S" />
                        </Field>
                        <Field label="Modèle" htmlFor={`m-${first.id}`}>
                          <Input id={`m-${first.id}`} name="model" defaultValue={first.model} required maxLength={120} />
                        </Field>
                        <Field label="Années (facultatif)" htmlFor={`y-${first.id}`}>
                          <Input id={`y-${first.id}`} name="years" maxLength={40} placeholder="Ex. : 2014-2020" />
                        </Field>
                      </div>
                      <div>
                        <SubmitButton pendingLabel="Lancement…">✦ Préparer la fiche</SubmitButton>
                      </div>
                    </ActionForm>
                  ) : (
                    <p className="text-sm text-muted">Recherche et rédaction en cours dans la file d’import.</p>
                  )}
                  <details className="text-sm">
                    <summary className="cursor-pointer font-semibold text-muted">Refuser la demande</summary>
                    <ActionForm action={declineRequests} resetOnSuccess={false} className="mt-2 flex flex-wrap items-end gap-2">
                      {idsInputs}
                      <div className="min-w-0 flex-[1_1_280px]">
                        <Field label="Mot pour le membre (facultatif)" htmlFor={`n-${first.id}`}>
                          <Input id={`n-${first.id}`} name="note" maxLength={300} placeholder="Ex. : modèle introuvable, précisez l’année" />
                        </Field>
                      </div>
                      <SubmitButton variant="danger" pendingLabel="…">
                        Refuser
                      </SubmitButton>
                    </ActionForm>
                  </details>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </>
  );
}
