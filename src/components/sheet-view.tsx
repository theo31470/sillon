import type { ReactNode } from 'react';
import type { InfoOrigin, SheetContent } from '@/lib/sheets/schema';
import { dimensions, groupIcon, hourScalePosition, maintenanceBuckets, type MachineKind } from '@/lib/sheets/insights';
import { Icon } from '@/components/sheets/icons';
import { DimensionDiagram } from '@/components/sheets/dimension-diagram';
import { CopyReference, SheetToc, type TocItem } from '@/components/sheets/sheet-client';

type Source = { document: string; page: number | null } | null;

function SourceTag({ source }: { source: Source }) {
  if (!source) return <span className="text-xs text-warn">Source non trouvée</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <Icon name="book" size={12} />
      {source.document}
      {source.page ? `, p. ${source.page}` : ''}
    </span>
  );
}

const ORIGIN_LABELS: Record<InfoOrigin, { label: string; title: string; className: string }> = {
  constructeur: { label: 'Constructeur', title: 'Manuel, notice ou site du constructeur', className: 'bg-brand-soft text-brand-dark' },
  presse: { label: 'Presse agricole', title: 'Essai ou dossier de la presse spécialisée', className: 'bg-info-soft text-info' },
  utilisateurs: { label: 'Retours d’utilisateurs', title: 'Problème rapporté par plusieurs propriétaires', className: 'bg-warn-soft text-warn' },
  general: { label: 'Repère indicatif', title: 'Pratique habituelle pour ce type de tracteur, à confirmer dans le carnet d’entretien', className: 'bg-ground text-muted ring-1 ring-line' },
};

function OriginTag({ origin }: { origin?: InfoOrigin }) {
  const o = ORIGIN_LABELS[origin ?? 'constructeur'];
  return (
    <span title={o.title} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${o.className}`}>
      {o.label}
    </span>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: Parameters<typeof Icon>[0]['name']; title: string; subtitle?: string }) {
  return (
    <header className="mb-5 flex items-start gap-3.5">
      <span className="flex size-11 flex-none items-center justify-center rounded-xl bg-brand text-white shadow-[0_6px_16px_-6px_rgba(47,109,58,0.6)]">
        <Icon name={icon} size={22} />
      </span>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {subtitle ? <p className="text-[15px] text-muted">{subtitle}</p> : null}
      </div>
    </header>
  );
}

/**
 * Affichage d'une fiche technique (site public et aperçu admin).
 * `kind` active le schéma de gabarit pour les tracteurs.
 */
export function SheetView({
  content,
  showSources = false,
  kind,
  withToc = false,
  maintenanceCta,
}: {
  content: SheetContent;
  showSources?: boolean;
  kind?: MachineKind;
  withToc?: boolean;
  maintenanceCta?: ReactNode;
}) {
  const specCount = content.specs.reduce((n, g) => n + g.items.length, 0);
  const toc: TocItem[] = [
    { id: 'caracteristiques', label: 'Caractéristiques', count: specCount },
    { id: 'entretien', label: 'Entretien', count: content.maintenance.length },
    { id: 'pannes', label: 'Pannes', count: content.faults.length },
    { id: 'pieces', label: 'Pièces', count: content.parts.length },
  ];
  const missing = toc.filter((t) => t.count === 0 && t.id !== 'caracteristiques').map((t) => t.label.toLowerCase());

  const dims = dimensions(content);
  const showDiagram = kind === 'tracteur' && ['length', 'height', 'wheelbase'].filter((k) => k in dims).length >= 2;
  const buckets = maintenanceBuckets(content.maintenance);
  const hourMarks = [...new Set(content.maintenance.map((m) => m.interval_hours).filter((h): h is number => Boolean(h)))].sort((a, b) => a - b);
  const maxHours = hourMarks.at(-1) ?? 1000;

  const body = (
    <div className="flex min-w-0 flex-col gap-6">
      {content.specs.length > 0 ? (
        <section id="caracteristiques" className="reveal scroll-mt-24 rounded-2xl border border-line bg-white p-4 sm:p-7">
          <SectionTitle icon="gear" title="Caractéristiques techniques" subtitle={`${specCount} valeurs relevées dans la documentation du constructeur`} />
          <div className="gap-5 md:columns-2 [&>*]:mb-5 [&>*]:break-inside-avoid">
            {content.specs.map((group) => (
              <article key={group.group} className="spec-card rounded-xl border border-line bg-white">
                <h3 className="flex items-center gap-2.5 border-b border-line px-4 py-3 font-semibold">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-brand-tint text-brand">
                    <Icon name={groupIcon(group.group)} size={18} />
                  </span>
                  {group.group}
                  <span className="ml-auto text-xs font-medium text-muted">{group.items.length}</span>
                </h3>
                <dl className="text-[15px]">
                  {group.items.map((item) => {
                    const short = !item.value || item.value.length <= 18;
                    return (
                    <div key={item.label} className={`flex justify-between border-b border-[#f0f2ee] px-4 py-2.5 transition-colors last:border-0 hover:bg-brand-tint/60 ${short ? 'items-baseline gap-4' : 'flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4'}`}>
                      <dt className="min-w-0 flex-1 text-muted">{item.label}</dt>
                      <dd className={`font-semibold tabular-nums ${short ? 'whitespace-nowrap text-right' : 'sm:max-w-[55%] sm:text-right'}`}>
                        {item.value ?? <span className="font-normal text-muted">—</span>}
                        {showSources ? <span className="block font-normal"><SourceTag source={item.source} /></span> : null}
                      </dd>
                    </div>
                    );
                  })}
                </dl>
              </article>
            ))}
          </div>
          {showDiagram ? (
            <figure className="mt-1 overflow-hidden rounded-xl border border-line bg-[#fbfcf9]">
              <figcaption className="flex items-center gap-2 border-b border-line px-4 py-3 font-semibold">
                <span className="flex size-8 items-center justify-center rounded-lg bg-brand-tint text-brand"><Icon name="ruler" size={18} /></span>
                Gabarit
                <span className="ml-auto flex flex-wrap justify-end gap-1.5">
                  {dims.width ? <span className="rounded-full bg-ground px-3 py-1 text-xs font-semibold text-muted">Largeur hors tout {dims.width}</span> : null}
                  {dims.clearance ? <span className="rounded-full bg-ground px-3 py-1 text-xs font-semibold text-muted">Garde au sol {dims.clearance}</span> : null}
                </span>
              </figcaption>
              <div className="mx-auto max-w-[600px] px-2 py-3 sm:px-6">
                <DimensionDiagram dims={dims} />
              </div>
            </figure>
          ) : null}
        </section>
      ) : null}

      {content.maintenance.length > 0 ? (
        <section id="entretien" className="reveal scroll-mt-24 rounded-2xl border border-line bg-white p-4 sm:p-7">
          <SectionTitle icon="wrench" title="Carnet d’entretien" subtitle="Les opérations à prévoir, de la plus fréquente à la plus espacée" />

          {hourMarks.length > 0 ? (
            <div className="mb-7 rounded-xl bg-admin px-5 pb-9 pt-4 text-white">
              <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#9fb3a4]">
                <Icon name="clock" size={14} /> Compteur d’heures moteur
              </p>
              <div className="relative mx-2 h-2 rounded-full bg-[#3a4a3f]">
                <div className="hour-fill absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#5fae6b] to-[#d9b45a]" />
                {hourMarks.map((h) => (
                  <span key={h} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${hourScalePosition(h, maxHours) * 100}%` }}>
                    <span className="block size-4 rounded-full border-[3px] border-admin bg-[#d9b45a]" />
                    <span className="absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap rounded bg-[#26302a] px-1.5 py-0.5 font-mono text-xs tabular-nums">
                      {h.toLocaleString('fr-FR')} h
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <ol className="relative flex flex-col gap-5 border-l-2 border-dashed border-[#d8dfd3] pl-6">
            {buckets.map((b) => (
              <li key={b.key} className="relative">
                <span className={`absolute -left-[33px] top-1 flex size-4 items-center justify-center rounded-full ring-4 ring-white ${b.hours || b.months ? 'bg-brand' : 'bg-field'}`} />
                <p className="mb-2.5 flex items-center gap-2 font-semibold">
                  <Icon name={b.hours ? 'clock' : b.months ? 'calendar' : 'book'} size={17} className={b.hours || b.months ? 'text-brand' : 'text-muted'} />
                  {b.label}
                </p>
                <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                  {b.items.map((m) => (
                    <div key={m.operation} className="lift-card rounded-xl border border-line bg-ground/60 p-3.5">
                      <p className="flex items-start justify-between gap-2 font-medium leading-snug">
                        {m.operation}
                        {m.origin && m.origin !== 'constructeur' ? <OriginTag origin={m.origin} /> : null}
                      </p>
                      {m.product || m.capacity ? (
                        <p className="mt-2 flex flex-wrap gap-1.5 text-[13px]">
                          {m.product ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-wheat-soft px-2.5 py-0.5 font-semibold text-soil">
                              <Icon name="can" size={13} /> {m.product}
                            </span>
                          ) : null}
                          {m.capacity ? <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold text-muted ring-1 ring-line">{m.capacity}</span> : null}
                        </p>
                      ) : null}
                      {showSources ? <p className="mt-1.5"><SourceTag source={m.source} /></p> : null}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-warn-soft px-4 py-3 text-sm text-[#6b5426]">
            <p className="flex items-center gap-2">
              <Icon name="book" size={16} />
              {content.maintenance.some((m) => m.origin === 'general')
                ? 'Les « repères indicatifs » sont des pratiques habituelles : vérifiez toujours dans le carnet d’entretien de votre machine.'
                : 'Le manuel du constructeur fait toujours foi. Au premier des deux termes atteint (heures ou mois).'}
            </p>
            {maintenanceCta}
          </div>
        </section>
      ) : null}

      {content.faults.length > 0 ? (
        <section id="pannes" className="reveal scroll-mt-24 rounded-2xl border border-line bg-white p-4 sm:p-7">
          <SectionTitle icon="warning" title="Pannes connues et tests" subtitle="Causes possibles et tests à faire, du plus simple au plus poussé" />
          <div className="flex flex-col gap-3">
            {content.faults.map((f, i) => (
              <details key={f.symptom} open={i === 0} className="fault group rounded-xl border border-line transition-colors open:border-[#d5dccf] open:bg-[#fcfdfb]">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span className={`flex size-9 flex-none items-center justify-center rounded-full ${f.difficulty === 'facile' ? 'bg-brand-soft text-brand-dark' : 'bg-warn-soft text-warn'}`}>
                    <Icon name={f.difficulty === 'facile' ? 'wrench' : 'warning'} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-semibold leading-snug">{f.symptom}</span>
                    <span className="mt-1 block"><OriginTag origin={f.origin} /></span>
                  </span>
                  <span className={`hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:inline ${f.difficulty === 'facile' ? 'bg-brand-soft text-brand-dark' : 'bg-warn-soft text-warn'}`}>
                    {f.difficulty === 'facile' ? 'Réparable soi-même' : 'Atelier conseillé'}
                  </span>
                  <Icon name="chevron" size={20} className="flex-none text-muted transition-transform duration-300 group-open:rotate-180" />
                </summary>
                <div className="grid gap-6 border-t border-line px-4 pb-5 pt-4 sm:px-5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                  <div>
                    <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Causes possibles</p>
                    <ul className="flex flex-col gap-2">
                      {f.causes.map((c) => (
                        <li key={c} className="flex gap-2.5"><span className="mt-2 size-1.5 flex-none rounded-full bg-wheat" />{c}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Tests à faire, dans l’ordre</p>
                    <ol className="flex flex-col">
                      {f.checks.map((c, n) => (
                        <li key={c} className="relative flex gap-3 pb-3 last:pb-0">
                          {n < f.checks.length - 1 ? <span className="absolute left-[13px] top-7 h-[calc(100%-24px)] w-px bg-line" /> : null}
                          <span className="flex size-7 flex-none items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{n + 1}</span>
                          <span className="pt-0.5">{c}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  {showSources ? <p className="col-span-full"><SourceTag source={f.source} /></p> : null}
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {withToc && missing.length > 0 ? (
        <section className="reveal flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-field bg-white/60 p-5 text-sm text-muted">
          <Icon name="book" size={20} className="flex-none text-wheat" />
          <p className="min-w-0 flex-1">
            <strong className="text-ink">Pas encore renseigné pour ce modèle :</strong> {missing.join(', ')}. Ces informations seront ajoutées dès qu’une source fiable (manuel du constructeur) sera disponible.
          </p>
        </section>
      ) : null}

      {content.parts.length > 0 ? (
        <section id="pieces" className="reveal scroll-mt-24 rounded-2xl border border-line bg-white p-4 sm:p-7">
          <SectionTitle icon="tag" title="Pièces d’entretien" subtitle="À commander chez votre concessionnaire avec la référence d’origine" />
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
            {content.parts.map((p) => (
              <div key={p.name} className="part-tag lift-card relative rounded-xl border border-line bg-white py-4 pl-9 pr-4">
                <span className="absolute left-3.5 top-5 size-2.5 rounded-full border-2 border-field bg-ground" aria-hidden="true" />
                <p className="font-semibold leading-snug">
                  {p.name}
                  {p.quantity ? <span className="ml-1.5 rounded bg-ground px-1.5 text-sm font-medium text-muted">× {p.quantity}</span> : null}
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  {p.reference ? (
                    <>
                      <code className="rounded-md bg-brand-tint px-2 py-1 font-mono text-sm font-semibold text-brand-dark">{p.reference}</code>
                      <CopyReference value={p.reference} />
                    </>
                  ) : (
                    <span className="text-sm text-muted">Référence à demander au concessionnaire</span>
                  )}
                </div>
                {showSources ? <p className="mt-1.5"><SourceTag source={p.source} /></p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );

  if (!withToc) return body;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
      <div className="no-print sticky top-0 z-10 min-w-0 lg:top-6">
        <SheetToc items={toc} />
      </div>
      {body}
    </div>
  );
}
