'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';

/** Onglets de l'espace bourse (la page active est soulignée). */
export function BourseTabsNav({ tabs }: { tabs: { href: Route; label: string; badge?: number }[] }) {
  const pathname = usePathname();
  // L'onglet le plus précis gagne (« Versements » est sous « Mes annonces »).
  const active = tabs.filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="Bourse au matériel" className="-mx-4 flex items-center gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active === t.href ? 'page' : undefined}
          className={`-mb-px flex flex-none items-center gap-2 border-b-2 px-3 py-2.5 text-[15px] font-semibold transition-colors ${active === t.href ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'}`}
        >
          {t.label}
          {t.badge ? <span className="rounded-full bg-brand px-2 text-xs leading-5 text-on-brand">{t.badge}</span> : null}
        </Link>
      ))}
      <Link href="/bourse" className="ml-auto flex-none px-3 py-2.5 text-[15px] font-semibold text-brand-dark hover:underline">
        Voir la bourse ↗
      </Link>
    </nav>
  );
}
