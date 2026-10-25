import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublishedSheet } from '@/lib/content';
import { parseSheetContent } from '@/lib/sheets/schema';
import { keyFigures, machineKind, MACHINE_KIND_LABELS } from '@/lib/sheets/insights';
import { SheetView } from '@/components/sheet-view';
import { MachineScene, FurrowBand } from '@/components/sheets/machine-art';
import { FIGURE_ICONS, Icon } from '@/components/sheets/icons';
import { PhotoCreditLine } from '@/components/sheets/photo-credit';
import { btn } from '@/components/ui';
import { SubmitButton } from '@/components/form-bits';
import { formatDate } from '@/lib/format';
import { SHEET_CATEGORIES } from '@/lib/types';
import { getSession } from '@/lib/auth';
import { addMachineFromSheet } from '@/app/app/materiel/actions';

const FIGURE_COLS: Record<number, string> = { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' };

export async function generateMetadata(props: PageProps<'/fiches/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params;
  const sheet = await getPublishedSheet(slug);
  return sheet ? { title: sheet.title, description: sheet.summary } : { title: 'Fiche introuvable' };
}

export default async function SheetPage(props: PageProps<'/fiches/[slug]'>) {
  const { slug } = await props.params;
  const sheet = await getPublishedSheet(slug);
  if (!sheet) notFound();
  const content = parseSheetContent(sheet.content);
  const kind = machineKind(sheet);
  const figures = keyFigures(content);
  const isMachine = sheet.category === 'machine';
  // Pages web consultées (fiches importées par marque), dédoublonnées.
  const webSources = [...new Map((sheet.sources ?? []).filter((s) => s.url && /^https?:\/\//.test(s.url)).map((s) => [s.url!, s])).values()].slice(0, 12);
  let loggedIn = false;
  try { loggedIn = Boolean(await getSession()); } catch { /* base non configurée */ }

  const followButton = isMachine ? (
    loggedIn ? (
      <form action={addMachineFromSheet}>
        <input type="hidden" name="sheet_id" value={sheet.id} />
        <SubmitButton pendingLabel="Ajout…">Ajouter à mon parc</SubmitButton>
      </form>
    ) : (
      <Link href="/inscription" className={btn.primary}>Suivre l’entretien de cette machine</Link>
    )
  ) : null;

  return (
    <div className="bg-ground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <nav aria-label="Fil d’Ariane" className="no-print flex flex-wrap items-center gap-2 text-sm text-muted">
          <Link href="/fiches" className="link-underline text-brand" transitionTypes={['nav-back']}>Fiches techniques</Link>
          <span aria-hidden="true">›</span>
          <Link href={`/fiches?categorie=${sheet.category}`} className="link-underline text-brand" transitionTypes={['nav-back']}>{SHEET_CATEGORIES[sheet.category]}</Link>
          <span aria-hidden="true">›</span>
          <span className="text-ink">{sheet.title}</span>
        </nav>

        <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_1px_0_rgba(0,0,0,0.08)]">
          <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="relative min-h-[260px] overflow-hidden bg-photo sm:min-h-[340px]">
              {sheet.cover_url ? (
                <>
                  <Image src={sheet.cover_url} alt={sheet.title} fill priority sizes="(min-width: 1024px) 600px, 100vw" className="object-cover" />
                  <PhotoCreditLine credit={sheet.cover_credit} />
                </>
              ) : (
                <MachineScene kind={kind} uid={sheet.id} label={`Illustration : ${MACHINE_KIND_LABELS[kind].toLowerCase()}`} className="hero-scene absolute inset-0 size-full" tall />
              )}
              <span className="absolute left-4 top-4 rounded-full bg-surface/90 px-3 py-1 text-[13px] font-semibold text-brand-dark shadow-sm backdrop-blur">
                {MACHINE_KIND_LABELS[kind]}
              </span>
            </div>

            <div className="flex flex-col gap-4 p-6 sm:p-8">
              {sheet.brand ? (
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand">{sheet.brand}</p>
              ) : null}
              <h1 className="text-[clamp(30px,3.4vw,42px)] font-bold leading-[1.08] tracking-tight">{sheet.title}</h1>
              <p className="text-[17px] leading-relaxed text-muted">{content.summary || sheet.summary}</p>
              <ul className="flex flex-wrap gap-2 text-[13px] font-semibold">
                <li className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-brand-dark">
                  <Icon name="check" size={14} /> Relue avant publication
                </li>
                <li className="inline-flex items-center gap-1.5 rounded-full bg-ground px-3 py-1 text-muted">
                  <Icon name="book" size={14} /> {webSources.length ? 'Sources citées en bas de page' : 'D’après la documentation constructeur'}
                </li>
                <li className="inline-flex items-center gap-1.5 rounded-full bg-ground px-3 py-1 text-muted">
                  <Icon name="calendar" size={14} /> Mise à jour le {formatDate(sheet.updated_at)}
                </li>
              </ul>
              <div className="no-print mt-auto flex flex-wrap gap-2.5 pt-2">
                {followButton}
                <a href="#caracteristiques" className={btn.secondary}>Voir la fiche complète</a>
              </div>
            </div>
          </div>

          {figures.length > 0 ? (
            <dl className={`grid grid-cols-2 border-t border-line ${FIGURE_COLS[figures.length]}`}>
              {figures.map((f, i) => (
                <div key={f.key} className={`figure flex items-center gap-3.5 px-5 py-5 sm:px-7 ${i % 2 === 1 ? 'border-l border-line' : ''} ${i >= 2 ? 'border-t border-line lg:border-t-0' : ''} ${i >= 1 ? 'lg:border-l' : ''}`} style={{ animationDelay: `${120 + i * 70}ms` }}>
                  <span className="hidden size-11 flex-none items-center justify-center rounded-full bg-wheat-soft text-soil sm:flex">
                    <Icon name={FIGURE_ICONS[f.key] ?? 'gear'} size={22} />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-muted">{f.label}</dt>
                    <dd className="text-[22px] font-bold leading-tight tabular-nums">{f.main}</dd>
                    {f.sub ? <dd className="truncate text-sm text-muted">{f.sub}</dd> : null}
                  </div>
                </div>
              ))}
            </dl>
          ) : null}
          <FurrowBand className="block h-3 w-full text-brand-soft" />
        </section>

        <SheetView
          content={content}
          kind={kind}
          withToc
          maintenanceCta={isMachine ? (
            <Link href={loggedIn ? '/app/materiel' : '/inscription'} className="link-underline font-semibold text-brand-dark">
              Recevoir les rappels d’entretien →
            </Link>
          ) : null}
        />

        {webSources.length ? (
          <section className="rounded-2xl border border-line bg-surface p-6">
            <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold"><Icon name="book" size={18} className="text-brand" /> Sources consultées</h2>
            <p className="mb-3 text-sm text-muted">Fiche établie à partir des pages ci-dessous, puis relue par l’équipe Tracteurs & Co. En cas de doute, le manuel du constructeur fait foi.</p>
            <ul className="grid gap-x-6 gap-y-1.5 text-sm [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
              {webSources.map((s) => (
                <li key={s.url} className="min-w-0 truncate">
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="link-underline text-brand-dark">
                    <span className="font-semibold">{new URL(s.url!).hostname.replace(/^www\./, '')}</span> · {s.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="no-print flex flex-wrap items-center gap-5 rounded-2xl bg-admin p-6 text-white sm:p-8">
          <span className="flex size-12 flex-none items-center justify-center rounded-xl bg-admin-2 text-wheat">
            <Icon name="wrench" size={24} />
          </span>
          <div className="min-w-0 flex-[1_1_320px]">
            <h2 className="text-xl font-semibold">Une panne sur cette machine ?</h2>
            <p className="text-panel-muted">Décrivez ce qui se passe : l’aide au diagnostic vous indique les causes possibles et quoi vérifier, dans l’ordre.</p>
          </div>
          <Link href="/app/diagnostic" className={btn.primary}>
            Trouver la cause
          </Link>
        </section>
      </div>
    </div>
  );
}
