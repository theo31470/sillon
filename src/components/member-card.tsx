'use client';

import { useRef } from 'react';

/**
 * Carte de membre Complet : s'incline légèrement sous le doigt ou la souris,
 * avec un reflet qui passe. Toujours sombre, en mode clair comme en sombre.
 */
export function MemberCard({
  farm,
  holder,
  since,
  number,
  status = 'Complet',
  flip = false,
  className = '',
}: {
  farm: string;
  holder: string;
  since: string;
  number: string;
  status?: string;
  flip?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
  };
  const reset = () => {
    ref.current?.style.setProperty('--ry', '0deg');
    ref.current?.style.setProperty('--rx', '0deg');
  };
  return (
    <div className={`@container ${flip ? 'member-card-flip' : ''} ${className}`}>
      <div ref={ref} className="member-card" onPointerMove={move} onPointerLeave={reset} role="img" aria-label={`Carte de membre ${status} de ${farm || holder}`}>
        <div className="relative flex h-full flex-col justify-between p-[6%]">
          <div className="flex items-start justify-between gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG statique de la charte */}
            <img src="/brand/embleme-sombre.svg" alt="" className="h-auto w-[22%] drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]" />
            <span className="rounded-full border border-[#e0875a]/60 bg-[#e0875a]/15 px-3 py-1 font-display text-[clamp(10px,2.6cqw,13px)] font-bold uppercase tracking-[0.18em] text-[#f2a878]">
              Membre {status}
            </span>
          </div>
          <div className="flex flex-col gap-[3%]">
            <span className="truncate font-display text-[clamp(17px,5.6cqw,26px)] font-bold uppercase leading-none tracking-wide">{farm || 'Votre exploitation'}</span>
            <span className="truncate text-[clamp(12px,3.2cqw,15px)] text-[#c9c1b5]">{holder}</span>
            <span className="mt-[2%] flex items-end justify-between gap-3 whitespace-nowrap text-[clamp(9px,2.5cqw,12px)] uppercase tracking-[0.1em] text-[#ada497]">
              <span className="min-w-0 truncate">Depuis {since}</span>
              <span className="flex-none font-mono tracking-[0.08em] text-[#d9cfc0]">{number}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
