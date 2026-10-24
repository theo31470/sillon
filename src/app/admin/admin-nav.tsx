'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const main = [
  { href: '/admin', label: 'Vue d’ensemble' },
  { href: '/admin/membres', label: 'Membres' },
  { href: '/admin/paiements', label: 'Abonnements & paiements' },
  { href: '/admin/blog', label: 'Blog' },
  { href: '/admin/fiches', label: 'Fiches techniques' },
];
const security = [{ href: '/admin/journal', label: 'Journal d’activité' }];

export function AdminNav({ pendingSheets }: { pendingSheets: number }) {
  const pathname = usePathname();
  const item = (l: { href: string; label: string }) => {
    const active = l.href === '/admin' ? pathname === '/admin' : pathname.startsWith(l.href);
    return (
      <Link
        key={l.href}
        href={l.href}
        aria-current={active ? 'page' : undefined}
        className={`flex justify-between rounded-lg px-3 py-2.5 ${active ? 'bg-brand font-medium text-white' : 'hover:bg-[#26302a]'}`}
      >
        {l.label}
        {l.href === '/admin/fiches' && pendingSheets > 0 ? (
          <span className="rounded-full bg-[#d99a2b] px-2 text-xs font-bold text-admin">{pendingSheets}</span>
        ) : null}
      </Link>
    );
  };
  return (
    <nav aria-label="Administration" className="flex flex-col gap-0.5 text-[15px]">
      {main.map(item)}
      <p className="mx-3 mb-1 mt-3.5 text-xs font-semibold uppercase tracking-wider text-[#8fa195]">Sécurité</p>
      {security.map(item)}
      <Link href="/app" className="mt-3 rounded-lg px-3 py-2.5 text-[#8fa195] hover:bg-[#26302a]">← Retour à l’application</Link>
    </nav>
  );
}
