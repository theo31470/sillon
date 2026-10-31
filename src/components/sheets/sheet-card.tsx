import Image from 'next/image';
import Link from 'next/link';
import { parseSheetContent } from '@/lib/sheets/schema';
import { keyFigures, machineKind, MACHINE_KIND_LABELS } from '@/lib/sheets/insights';
import { MachineScene } from '@/components/sheets/machine-art';
import { FIGURE_ICONS, Icon } from '@/components/sheets/icons';
import { PhotoCreditLine } from '@/components/sheets/photo-credit';
import type { TechSheet } from '@/lib/types';

export type SheetCardData = Pick<TechSheet, 'id' | 'slug' | 'title' | 'category' | 'brand' | 'model' | 'summary' | 'cover_url' | 'cover_credit' | 'content'>;

/** Carte d'une fiche publiée (liste des fiches, pages par marque). */
export function SheetCard({ sheet: s, index: i = 0, headingLevel = 'h2' }: { sheet: SheetCardData; index?: number; headingLevel?: 'h2' | 'h3' }) {
  const kind = machineKind(s);
  const figures = keyFigures(parseSheetContent(s.content), 2);
  const Heading = headingLevel;
  return (
    <Link
      href={`/fiches/${s.slug}`}
      transitionTypes={['nav-forward']}
      className="sheet-card reveal group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink"
      style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
    >
      <div className="relative h-44 overflow-hidden bg-photo">
        {s.cover_url ? (
          <>
            <Image src={s.cover_url} alt="" fill sizes="(min-width: 768px) 320px, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
            <PhotoCreditLine credit={s.cover_credit} compact />
          </>
        ) : (
          <MachineScene kind={kind} uid={s.id} label="" className="size-full" />
        )}
        <span className="absolute left-3 top-3 rounded-full bg-surface/90 px-2.5 py-0.5 text-xs font-semibold text-brand-dark backdrop-blur">{MACHINE_KIND_LABELS[kind]}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        {s.brand ? <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">{s.brand}</p> : null}
        <Heading className="text-lg font-semibold leading-snug">{s.title}</Heading>
        {figures.length > 0 ? (
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {figures.map((f) => (
              <li key={f.key} className="inline-flex items-center gap-1 rounded-full bg-wheat-soft px-2.5 py-1 text-[13px] font-semibold text-soil">
                <Icon name={FIGURE_ICONS[f.key] ?? 'gear'} size={14} /> {f.main}
              </li>
            ))}
          </ul>
        ) : (
          <p className="line-clamp-2 text-sm text-muted">{s.summary}</p>
        )}
        <p className="mt-auto flex items-center gap-1 pt-3 text-sm font-semibold text-brand">
          Ouvrir la fiche{' '}
          <span className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">
            →
          </span>
        </p>
      </div>
    </Link>
  );
}
