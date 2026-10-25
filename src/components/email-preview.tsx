'use client';

import { useEffect, useRef } from 'react';

/**
 * Aperçu d'un e-mail dans la page. Le HTML est placé dans un « shadow DOM » :
 * ses styles ne débordent pas sur le site, et inversement. (Une iframe serait
 * bloquée par la politique de sécurité du site, qui interdit tout cadre.)
 * Le contenu vient de nos propres modèles, déjà échappés.
 */
export function EmailPreview({ html, className = '' }: { html: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>:host{display:block;background:#efebe5;color:#1b1916}</style>${html}`;
  }, [html]);
  return <div ref={host} className={className} />;
}
