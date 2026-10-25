'use client';

import { useEffect, useState } from 'react';
import { Icon } from './icons';

export type TocItem = { id: string; label: string; count: number };

/** Sommaire de la fiche : suit la section affichée à l'écran. */
export function SheetToc({ items, printable = true }: { items: TocItem[]; printable?: boolean }) {
  const [active, setActive] = useState(items.find((i) => i.count > 0)?.id);

  useEffect(() => {
    const sections = items.filter((i) => i.count > 0).map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => Boolean(el));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-15% 0px -60% 0px' },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav
      aria-label="Sommaire de la fiche"
      className="no-print -mx-6 flex gap-2 overflow-x-auto border-b border-line bg-ground/90 px-6 py-3 backdrop-blur lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:rounded-2xl lg:border lg:bg-surface lg:p-3"
    >
      <p className="hidden px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted lg:block">Sur cette fiche</p>
      {items.map((item) =>
        item.count === 0 ? (
          <span
            key={item.id}
            title="Pas encore renseigné"
            className="flex flex-none items-center justify-between gap-3 whitespace-nowrap rounded-full px-4 py-2 text-[15px] font-medium text-muted/60 lg:rounded-lg lg:px-3"
          >
            {item.label}
            <span className="rounded-full px-2 text-xs">—</span>
          </span>
        ) : (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={active === item.id ? 'true' : undefined}
            className={`toc-link flex flex-none items-center justify-between gap-3 whitespace-nowrap rounded-full px-4 py-2 text-[15px] font-medium transition-colors lg:rounded-lg lg:px-3 ${
              active === item.id ? 'bg-brand text-on-brand' : 'bg-surface text-ink hover:bg-brand-tint hover:text-brand-dark lg:bg-transparent'
            }`}
          >
            {item.label}
            <span className={`rounded-full px-2 text-xs font-semibold ${active === item.id ? 'bg-surface/20' : 'bg-ground text-muted'}`}>{item.count}</span>
          </a>
        ),
      )}
      {printable ? (
        <button
          type="button"
          onClick={() => window.print()}
          className="hidden items-center gap-2 rounded-lg px-3 py-2 text-left text-[15px] font-medium text-muted transition-colors hover:bg-ground hover:text-ink lg:mt-2 lg:flex lg:border-t lg:border-line lg:pt-3"
        >
          <Icon name="print" size={18} /> Imprimer pour l’atelier
        </button>
      ) : null}
    </nav>
  );
}

/** Copie une référence de pièce dans le presse-papiers. */
export function CopyReference({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* presse-papiers indisponible */
        }
      }}
      className="no-print inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-brand-tint hover:text-brand active:scale-90"
      aria-label={copied ? 'Référence copiée' : `Copier la référence ${value}`}
      title={copied ? 'Copiée !' : 'Copier'}
    >
      <Icon name={copied ? 'check' : 'copy'} size={16} />
    </button>
  );
}
