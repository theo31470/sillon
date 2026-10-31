import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { countPendingReview, parseSheetContent, type SheetContent } from '@/lib/sheets/schema';
import { SHEET_STATUSES, type SheetStatus } from '@/lib/types';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge } from '@/components/ui';
import { reviewSeries } from '../actions';
import { QUALITY_LABEL, sheetQuality } from '../shared';

export const metadata = { title: 'Relecture d’une série' };

type Model = {
  model: string;
  power_hp: number | null;
  years: string;
  sheet: { id: string; title: string; slug: string; status: SheetStatus; content: unknown; cover_url: string | null; sources: { url?: string | null }[] | null } | null;
};

const statusTone: Record<SheetStatus, 'green' | 'amber' | 'blue' | 'red' | 'gray'> = { generating: 'blue', review: 'amber', validated: 'gray', published: 'green', rejected: 'red' };
const ORIGIN_SHORT: Record<string, string> = { constructeur: 'constructeur', presse: 'presse', utilisateurs: 'utilisateurs', general: 'repère général' };
const LABEL_W = 200;
const COL_W = 230;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function interval(m: SheetContent['maintenance'][number]) {
  const parts = [m.interval_hours ? `${m.interval_hours} h` : null, m.interval_months ? `${m.interval_months} mois` : null].filter(Boolean);
  return parts.length ? parts.join(' / ') : 'sans intervalle';
}

export default async function SeriesReviewPage(props: PageProps<'/admin/fiches/series/voir'>) {
  await requireAdmin('/admin/fiches/series');
  const sp = await props.searchParams;
  const brand = typeof sp.marque === 'string' ? sp.marque.slice(0, 60) : '';
  const series = typeof sp.serie === 'string' ? sp.serie.slice(0, 120) : '';
  if (!brand) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from('catalog_models')
    .select('model, power_hp, years, sheet:tech_sheets!catalog_models_sheet_id_fkey(id, title, slug, status, content, cover_url, sources)')
    .eq('brand', brand)
    .eq('series', series)
    .not('sheet_id', 'is', null)
    .order('power_hp', { ascending: true, nullsFirst: false })
    .order('model')
    .limit(60);
  const models = ((data ?? []) as unknown as Model[]).filter((m) => m.sheet && m.sheet.status !== 'generating');
  if (!models.length) notFound();

  const cols = models.map((m) => ({ ...m, sheet: m.sheet!, content: parseSheetContent(m.sheet!.content) }));
  const reviewable = cols.filter((c) => ['review', 'validated'].includes(c.sheet.status));

  // Caractéristiques : union des libellés, groupe par groupe, dans l'ordre d'apparition.
  const groups: { name: string; labels: { key: string; label: string }[] }[] = [];
  for (const c of cols) {
    for (const g of c.content.specs) {
      let grp = groups.find((x) => norm(x.name) === norm(g.group));
      if (!grp) groups.push((grp = { name: g.group, labels: [] }));
      for (const it of g.items) if (!grp.labels.some((l) => l.key === norm(it.label))) grp.labels.push({ key: norm(it.label), label: it.label });
    }
  }
  const specOf = (c: (typeof cols)[number], group: string, key: string) => {
    const g = c.content.specs.find((x) => norm(x.group) === norm(group));
    return g?.items.find((i) => norm(i.label) === key) ?? c.content.specs.flatMap((x) => x.items).find((i) => norm(i.label) === key) ?? null;
  };
  // Entretien : union des opérations.
  const ops: { key: string; label: string }[] = [];
  for (const c of cols) for (const m of c.content.maintenance) if (!ops.some((o) => o.key === norm(m.operation))) ops.push({ key: norm(m.operation), label: m.operation });

  // Une ligne « diverge » quand les valeurs renseignées ne sont pas toutes identiques : à regarder de plus près.
  const differs = (values: (string | null | undefined)[]) => new Set(values.filter(Boolean).map((v) => norm(v!))).size > 1;

  const th = 'sticky left-0 z-10 break-words border-b border-r border-line bg-surface px-3 py-2 text-left align-top text-[13px] font-medium text-muted';
  const td = 'border-b border-line-soft px-3 py-2 align-top break-words';

  return (
    <>
      <Link href="/admin/fiches/series" className="text-sm text-brand">← Toutes les séries</Link>
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand">{brand}</p>
        <h1 className="text-[28px] font-bold tracking-tight">{series || 'Sans série'}</h1>
        <p className="max-w-3xl text-muted">
          {cols.length} modèle{cols.length > 1 ? 's' : ''}, du moins au plus puissant. <span className="rounded bg-warn-soft px-1.5 text-warn">Surligné</span> : information que Claude
          a signalée comme incertaine. <span className="font-semibold text-ink">◆</span> : les valeurs de la ligne diffèrent d’un modèle à l’autre, c’est souvent normal (puissance, poids),
          parfois une erreur (contenance d’huile, référence de filtre). Cliquez sur un modèle pour corriger sa fiche en détail.
        </p>
      </div>

      <div className="scroll-x rounded-2xl border border-line bg-surface">
        <table className="min-w-full table-fixed border-collapse text-sm" style={{ width: LABEL_W + cols.length * COL_W }}>
          <colgroup>
            <col style={{ width: LABEL_W }} />
            {cols.map((c) => (
              <col key={c.sheet.id} style={{ width: COL_W }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className={th}>Modèle</th>
              {cols.map((c) => (
                <th key={c.sheet.id} className="border-b border-line px-3 py-3 text-left align-top font-normal">
                  <div className="flex flex-col gap-2">
                    {c.sheet.cover_url ? (
                      <Image src={c.sheet.cover_url} alt="" width={200} height={110} className="h-[90px] w-full rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-[90px] w-full items-center justify-center rounded-lg bg-ground text-xs text-muted">Sans photo</div>
                    )}
                    <Link href={`/admin/fiches/${c.sheet.id}`} className="font-semibold text-ink hover:text-brand">
                      {c.model}
                    </Link>
                    <span className="flex flex-wrap gap-1.5">
                      <Badge tone={statusTone[c.sheet.status]}>{SHEET_STATUSES[c.sheet.status]}</Badge>
                      <Badge tone={sheetQuality(c.content) === 'mince' ? 'red' : sheetQuality(c.content) === 'correcte' ? 'amber' : 'green'}>{QUALITY_LABEL[sheetQuality(c.content)]}</Badge>
                    </span>
                    {['review', 'validated', 'published'].includes(c.sheet.status) ? (
                      <label className="flex items-center gap-2 text-[13px] font-semibold">
                        <input type="checkbox" name="fiche" value={c.sheet.id} form="serie-form" defaultChecked={c.sheet.status !== 'published' && sheetQuality(c.content) !== 'mince'} className="size-4 accent-[var(--color-brand)]" />
                        Inclure
                      </label>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className={th}>Résumé</th>
              {cols.map((c) => (
                <td key={c.sheet.id} className={`${td} text-[13px] text-muted`}>{c.content.summary || '—'}</td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={th}>Points à vérifier</th>
              {cols.map((c) => (
                <td key={c.sheet.id} className={td}>{countPendingReview(c.content) || '—'}</td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={th}>Sources web</th>
              {cols.map((c) => (
                <td key={c.sheet.id} className={td}>{new Set((c.sheet.sources ?? []).map((s) => s.url).filter(Boolean)).size || '—'}</td>
              ))}
            </tr>

            {groups.map((g) => (
              <SectionRows key={g.name} title={g.name} span={cols.length}>
                {g.labels.map((l) => {
                  const cells = cols.map((c) => specOf(c, g.name, l.key));
                  return (
                    <tr key={l.key}>
                      <th scope="row" className={th}>
                        {differs(cells.map((x) => x?.value)) ? <span className="mr-1 font-semibold text-ink" title="Valeurs différentes selon le modèle">◆</span> : null}
                        {l.label}
                      </th>
                      {cells.map((it, i) => (
                        <td key={cols[i].sheet.id} className={`${td} tabular-nums ${it?.needs_review ? 'bg-warn-soft' : ''}`}>
                          {it?.value ?? <span className="text-muted">—</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </SectionRows>
            ))}

            {ops.length ? (
              <SectionRows title="Entretien" span={cols.length}>
                {ops.map((o) => {
                  const cells = cols.map((c) => c.content.maintenance.find((m) => norm(m.operation) === o.key) ?? null);
                  return (
                    <tr key={o.key}>
                      <th scope="row" className={th}>
                        {differs(cells.map((m) => (m ? `${interval(m)} ${m.capacity ?? ''}` : null))) ? <span className="mr-1 font-semibold text-ink">◆</span> : null}
                        {o.label}
                      </th>
                      {cells.map((m, i) => (
                        <td key={cols[i].sheet.id} className={`${td} ${m?.needs_review ? 'bg-warn-soft' : ''}`}>
                          {m ? (
                            <>
                              <span className="font-semibold tabular-nums">{interval(m)}</span>
                              {m.product || m.capacity ? <span className="block text-[13px]">{[m.product, m.capacity].filter(Boolean).join(' · ')}</span> : null}
                              <span className="block text-xs text-muted">{ORIGIN_SHORT[m.origin] ?? m.origin}</span>
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </SectionRows>
            ) : null}

            <SectionRows title="Pannes et pièces" span={cols.length}>
              <tr>
                <th scope="row" className={th}>Pannes décrites</th>
                {cols.map((c) => (
                  <td key={c.sheet.id} className={`${td} text-[13px]`}>
                    {c.content.faults.length ? (
                      <ul className="flex list-disc flex-col gap-1 pl-4">
                        {c.content.faults.map((f, i) => (
                          <li key={i}>
                            {f.symptom} <span className="text-xs text-muted">({ORIGIN_SHORT[f.origin] ?? f.origin})</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className={th}>Pièces</th>
                {cols.map((c) => (
                  <td key={c.sheet.id} className={`${td} text-[13px]`}>
                    {c.content.parts.length ? c.content.parts.map((p) => `${p.name}${p.reference ? ` (${p.reference})` : ''}`).join(' · ') : <span className="text-muted">—</span>}
                  </td>
                ))}
              </tr>
            </SectionRows>
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-3 z-20 rounded-2xl border border-line bg-surface p-4 shadow-lg sm:p-5">
        <ActionForm action={reviewSeries} id="serie-form" resetOnSuccess={false} className="flex flex-col gap-3">
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="atteste" className="mt-0.5 size-4 flex-none accent-[var(--color-brand)]" />
            <span>
              J’ai relu le tableau. Les fiches cochées sont publiées telles quelles : chaque information y est considérée comme vérifiée. Les informations d’entretien
              et de pannes gardent leur origine affichée (constructeur, presse, utilisateurs ou repère général).
            </span>
          </label>
          <div className="flex flex-wrap gap-2.5">
            <SubmitButton name="op" value="publier" pendingLabel="Publication…">
              Publier les fiches cochées
            </SubmitButton>
            <SubmitButton name="op" value="rejeter" variant="danger" pendingLabel="Rejet…">
              Rejeter les fiches cochées
            </SubmitButton>
            {reviewable.length === 0 ? <p className="self-center text-sm text-muted">Toutes les fiches de cette série ont été traitées.</p> : null}
          </div>
        </ActionForm>
      </div>
    </>
  );
}

function SectionRows({ title, span, children }: { title: string; span: number; children: ReactNode }) {
  return (
    <>
      <tr>
        <th colSpan={span + 1} className="border-b border-line bg-ground px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted">
          {title}
        </th>
      </tr>
      {children}
    </>
  );
}
