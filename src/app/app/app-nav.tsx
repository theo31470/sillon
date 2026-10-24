'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/app', label: 'Accueil' },
  { href: '/app/parcelles', label: 'Parcelles' },
  { href: '/app/interventions', label: 'Interventions' },
  { href: '/app/materiel', label: 'Matériel' },
  { href: '/app/diagnostic', label: 'Diagnostic' },
  { href: '/fiches', label: 'Fiches techniques' },
];

export function AppNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation de l’application" className="flex flex-1 flex-wrap gap-1 text-[15px] font-medium">
      {links.map((l) => {
        const active = l.href === '/app' ? pathname === '/app' : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={`px-3 py-5 ${active ? 'border-b-[3px] border-brand pb-[17px] text-brand-dark' : 'text-muted hover:text-ink'}`}
          >
            {l.label}
          </Link>
        );
      })}
      {isAdmin ? (
        <Link href="/admin" className="px-3 py-5 text-muted hover:text-ink">Admin</Link>
      ) : null}
    </nav>
  );
}
