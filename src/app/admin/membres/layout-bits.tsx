import Link from 'next/link';
import type { ReactNode } from 'react';

/** Petits éléments de mise en page partagés par la liste et la fiche membre. */

export function StatTile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'info' }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 rounded-xl border px-4 py-3.5 ${tone === 'warn' ? 'border-warn-line bg-warn-soft' : 'border-line bg-surface'}`}>
      <span className="text-[13px] text-muted">{label}</span>
      <span className={`truncate text-lg font-bold ${tone === 'warn' ? 'text-warn' : tone === 'info' ? 'text-info' : ''}`}>{value}</span>
      {sub ? <span className="truncate text-[13px] text-muted">{sub}</span> : null}
    </div>
  );
}

export function Tabs({ tabs, current }: { tabs: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <nav aria-label="Rubriques" className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.href}
            scroll={false}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-[15px] transition-colors ${
              active ? 'border-brand font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t.label}
            {t.count ? <span className="rounded-full bg-ground px-2 text-xs font-semibold text-muted">{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Panneau d'une rubrique : une carte découpée en lignes réglage / contenu. */
export function Panel({ children }: { children: ReactNode }) {
  return <section className="divide-y divide-line rounded-2xl border border-line bg-surface">{children}</section>;
}

/** Ligne de réglage : intitulé et explication à gauche, contenu à droite. */
export function SettingRow({ title, description, children, danger }: { title: string; description?: ReactNode; children: ReactNode; danger?: boolean }) {
  return (
    <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:gap-8">
      <div>
        <h3 className={`font-semibold ${danger ? 'text-danger' : ''}`}>{title}</h3>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Liste « intitulé : valeur » alignée. */
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:gap-x-6">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Barre d'actions d'un formulaire, boutons alignés à droite. */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>;
}
