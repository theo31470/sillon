'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';

/**
 * Menu des petits écrans : un bouton « hamburger » qui ouvre un panneau latéral.
 * Se ferme au changement de page, avec Échap ou en touchant le fond.
 */
export function MobileMenu({
  children,
  label = 'Menu',
  tone = 'page',
  className = '',
}: {
  children: ReactNode;
  label?: string;
  /** Couleurs du panneau : celles du site, ou le fond sombre de l'administration. */
  tone?: 'page' | 'admin';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [shownFor, setShownFor] = useState(pathname);

  // Changement de page : on referme (pendant le rendu, sans effet en cascade).
  if (shownFor !== pathname) {
    setShownFor(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const panel =
    tone === 'admin' ? 'bg-admin text-panel border-admin-2' : 'bg-page text-ink border-line';

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`inline-flex size-11 items-center justify-center rounded-full border transition-colors ${tone === 'admin' ? 'border-admin-2 text-panel hover:bg-admin-2' : 'border-line text-ink hover:border-brand hover:text-brand'} ${className}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
              <button type="button" aria-label="Fermer le menu" className="menu-backdrop absolute inset-0 bg-black/55" onClick={() => setOpen(false)} />
              <div
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('a')) setOpen(false);
                }}
                className={`menu-panel absolute inset-y-0 right-0 flex w-[min(86vw,340px)] flex-col gap-2 overflow-y-auto border-l px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] shadow-2xl ${panel}`}
              >
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    aria-label="Fermer le menu"
                    onClick={() => setOpen(false)}
                    className={`inline-flex size-11 items-center justify-center rounded-full border ${tone === 'admin' ? 'border-admin-2' : 'border-line'}`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
                {children}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
