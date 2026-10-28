'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const svg = (d: ReactNode) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const links = [
  { href: '/app', label: 'Tableau de bord', short: 'Accueil', icon: svg(<><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></>) },
  { href: '/app/materiel', label: 'Mon parc', short: 'Mon parc', icon: svg(<><circle cx="7" cy="16.5" r="3.5" /><circle cx="18" cy="17.5" r="2.5" /><path d="M10.5 16.5h5M4 13V8h6l2 5h6.5l1.5 2" /><path d="M10 8V5h-4v3" /></>) },
  { href: '/app/diagnostic', label: 'Diagnostic', short: 'Diagnostic', icon: svg(<><path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.6-.4-.4-2.6z" /></>) },
  { href: '/fiches', label: 'Fiches techniques', short: 'Fiches', icon: svg(<><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" /><path d="M8 8h8M8 11.5h5" /></>) },
];

const isActive = (pathname: string, href: string) => (href === '/app' ? pathname === '/app' : pathname.startsWith(href));

/** Navigation du haut, sur grand écran. */
export function AppNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation de l’application" className="hidden flex-1 flex-wrap gap-1 text-[15px] font-medium md:flex">
      {links.map((l) => {
        const active = isActive(pathname, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={`px-3 py-5 transition-colors duration-200 ${active ? 'border-b-[3px] border-brand pb-[17px] text-brand-dark' : 'text-muted hover:text-ink'}`}
          >
            {l.label}
          </Link>
        );
      })}
      {isAdmin ? (
        <Link href="/admin" className="px-3 py-5 text-muted transition-colors duration-200 hover:text-ink">Admin</Link>
      ) : null}
    </nav>
  );
}

/** Barre d'onglets en bas de l'écran, sur téléphone : les 4 rubriques à portée de pouce. */
export function AppTabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation de l’application" className="tabbar no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {links.map((l) => {
          const active = isActive(pathname, l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11.5px] font-semibold transition-colors ${active ? 'text-brand' : 'text-muted active:text-ink'}`}
              >
                <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${active ? 'bg-brand-tint' : ''}`}>{l.icon}</span>
                {l.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
