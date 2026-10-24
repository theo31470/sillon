'use client';

import { useEffect, useState, ViewTransition, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Transition animée entre deux pages : la page sortante s'efface, la nouvelle
 * monte en fondu. Les liens marqués « nav-forward » / « nav-back » glissent
 * latéralement. Sans prise en charge du navigateur, rien ne change.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition
      key={pathname}
      enter={{ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page-enter' }}
      exit={{ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page-exit' }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}

function isInternalNavigation(event: MouseEvent, current: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const link = (event.target as Element | null)?.closest('a[href]') as HTMLAnchorElement | null;
  if (!link || link.target === '_blank' || link.hasAttribute('download')) return false;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin || url.pathname.startsWith('/api/')) return false;
  // Ancre sur la même page : pas de chargement.
  return url.pathname + url.search !== current;
}

/** Fine barre de progression en haut de l'écran pendant le changement de page. */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const url = search ? `${pathname}?${search}` : pathname;
  // Adresse de départ de la navigation en cours (null = aucune).
  const [startedFrom, setStartedFrom] = useState<{ url: string; at: number } | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (isInternalNavigation(event, url)) setStartedFrom({ url, at: Date.now() });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [url]);

  // Sécurité : si la page ne change jamais (erreur, lien vers la même page), on arrête.
  useEffect(() => {
    if (!startedFrom) return;
    const timer = setTimeout(() => setStartedFrom(null), 15_000);
    return () => clearTimeout(timer);
  }, [startedFrom]);

  if (!startedFrom) return null;
  const loading = startedFrom.url === url;
  return <div key={startedFrom.at} className={`nav-progress ${loading ? 'is-loading' : 'is-done'}`} aria-hidden="true" />;
}
