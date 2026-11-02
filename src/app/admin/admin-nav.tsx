'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const main = [
  { href: '/admin', label: 'Vue d’ensemble' },
  { href: '/admin/membres', label: 'Membres' },
  { href: '/admin/messages', label: 'Messages' },
  { href: '/admin/paiements', label: 'Abonnements & paiements' },
  { href: '/admin/factures', label: '↳ Factures' },
  { href: '/admin/codes-promo', label: '↳ Promos et parrainage' },
  { href: '/admin/boutique', label: 'Boutique' },
  { href: '/admin/bourse', label: 'Bourse au matériel' },
  { href: '/admin/emails', label: 'E-mails' },
  { href: '/admin/blog', label: 'Blog' },
  { href: '/admin/fiches', label: 'Fiches techniques' },
  { href: '/admin/fiches/series', label: '↳ Relecture par série' },
  { href: '/admin/fiches/catalogue', label: '↳ Import par marque' },
  { href: '/admin/fiches/demandes', label: '↳ Fiches demandées' },
];
const security = [
  { href: '/admin/journal', label: 'Journal d’activité' },
  { href: '/admin/maintenance', label: 'Mode maintenance' },
];

export function AdminNav({
  pendingSheets,
  newMessages = 0,
  newRequests = 0,
  maintenance = false,
}: {
  pendingSheets: number;
  newMessages?: number;
  newRequests?: number;
  maintenance?: boolean;
}) {
  const pathname = usePathname();
  const item = (l: { href: string; label: string }) => {
    const active =
      l.href === '/admin' ? pathname === '/admin' : l.href === '/admin/fiches' ? pathname.startsWith(l.href) && !/^\/admin\/fiches\/(catalogue|series|demandes)/.test(pathname) : pathname.startsWith(l.href);
    return (
      <Link
        key={l.href}
        href={l.href}
        aria-current={active ? 'page' : undefined}
        className={`flex justify-between rounded-lg px-3 py-2.5 transition-all duration-200 ${active ? 'bg-brand font-medium text-on-brand' : 'hover:translate-x-0.5 hover:bg-admin-2'}`}
      >
        {l.label}
        {l.href === '/admin/messages' && newMessages > 0 ? (
          <span className="self-center rounded-full bg-wheat px-2 text-xs font-bold text-admin">{newMessages}</span>
        ) : null}
        {l.href === '/admin/maintenance' && maintenance ? <span className="self-center rounded-full bg-warn px-2 text-xs font-bold text-admin">activé</span> : null}
        {l.href === '/admin/fiches/demandes' && newRequests > 0 ? (
          <span className="self-center rounded-full bg-wheat px-2 text-xs font-bold text-admin">{newRequests}</span>
        ) : null}
        {l.href === '/admin/fiches' && pendingSheets > 0 ? (
          <span className="self-center rounded-full bg-wheat px-2 text-xs font-bold text-admin">{pendingSheets}</span>
        ) : null}
      </Link>
    );
  };
  return (
    <nav aria-label="Administration" className="flex flex-col gap-0.5 text-[15px]">
      {main.map(item)}
      <p className="mx-3 mb-1 mt-3.5 text-xs font-semibold uppercase tracking-wider text-panel-muted">Sécurité</p>
      {security.map(item)}
      <Link href="/app" className="mt-3 rounded-lg px-3 py-2.5 text-panel-muted transition-colors hover:bg-admin-2 hover:text-white">← Retour à l’application</Link>
    </nav>
  );
}
