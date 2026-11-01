'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Tracteur } from '@/components/sheets/machine-art';

/**
 * Moment de fête après un paiement : le tracteur Tracteurs & Co arrive dans
 * le champ (avec sa remorque et le colis pour la boutique), une pluie de
 * confettis aux couleurs de la charte, puis le contenu (carte de membre,
 * récapitulatif de commande). Mouvement réduit : tout s'affiche sans animation.
 */

const COLORS = ['#e0875a', '#f2a878', '#d4a955', '#f3efe9', '#7fa16b', '#b9653c'];

// Tirage pseudo-aléatoire reproductible : même rendu côté serveur et navigateur.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function Confetti({ count = 80, seed = 7 }: { count?: number; seed?: number }) {
  const rnd = seeded(seed);
  const pieces = Array.from({ length: count }, (_, i) => ({
    x: `${rnd() * 100}%`,
    w: `${7 + rnd() * 9}px`,
    c: COLORS[i % COLORS.length],
    d: `${150 + rnd() * 1100}ms`,
    t: `${2400 + rnd() * 2200}ms`,
    dx: `${(rnd() - 0.5) * 260}px`,
    r: `${(rnd() - 0.5) * 1440}deg`,
  }));
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i key={i} style={{ ['--x' as string]: p.x, ['--w' as string]: p.w, ['--c' as string]: p.c, ['--d' as string]: p.d, ['--t' as string]: p.t, ['--dx' as string]: p.dx, ['--r' as string]: p.r }} />
      ))}
    </div>
  );
}

/** Le champ, le soleil et le tracteur qui arrive (avec remorque et colis pour une commande). */
export function CelebrationScene({ withParcel = false }: { withParcel?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const furrows = Array.from({ length: 19 }, (_, i) => -660 + i * 100);
  return (
    <svg viewBox="0 0 480 220" className="celebrate-scene" aria-hidden="true">
      <defs>
        <linearGradient id={`sky${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--art-sky-top)' }} />
          <stop offset="1" style={{ stopColor: 'var(--art-sky-bottom)' }} />
        </linearGradient>
        <linearGradient id={`field${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--art-field-top)' }} />
          <stop offset="1" style={{ stopColor: 'var(--art-field-bottom)' }} />
        </linearGradient>
        <radialGradient id={`glow${uid}`}>
          <stop offset="0" stopColor="#f2a878" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f2a878" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="480" height="220" fill={`url(#sky${uid})`} />
      <g className="celebrate-sun">
        <circle cx="360" cy="70" r="70" fill={`url(#glow${uid})`} />
        <circle cx="360" cy="70" r="28" style={{ fill: 'var(--art-sun)' }} />
      </g>
      <path d="M0 112c70-26 140-28 220-12s170 2 260-18v40H0z" style={{ fill: 'var(--art-hill-far)' }} />
      <path d="M0 122c90-18 170-6 250 0s160-8 230-12v18H0z" style={{ fill: 'var(--art-hill-near)' }} />
      <path d="M0 128h480v92H0z" fill={`url(#field${uid})`} />
      <g className="celebrate-furrows" strokeWidth="1.6" opacity="0.9" style={{ stroke: 'var(--art-furrow)' }}>
        {furrows.map((x) => (
          <path key={x} d={`M${240 + (x - 240) * 0.04} 128 L${x} 220`} />
        ))}
      </g>
      <path d="M0 128h480" strokeWidth="2" style={{ stroke: 'var(--art-horizon)' }} />

      <g className="celebrate-drive">
        <ellipse cx={withParcel ? 220 : 250} cy="206" rx={withParcel ? 200 : 120} ry="6" opacity="0.25" style={{ fill: 'var(--art-shadow)' }} />
        <g className="celebrate-dust" opacity="0.5" style={{ fill: 'var(--art-ink)' }}>
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={withParcel ? 40 - i * 14 : 150 - i * 14} cy={196 - i * 4} r={6 + i * 2} style={{ animationDelay: `${500 + i * 260}ms` }} />
          ))}
        </g>
        <g className="celebrate-bump">
          <g transform={`translate(${withParcel ? 200 : 160} 56) scale(0.82)`}>
            <Tracteur />
          </g>
          {withParcel ? (
            <g transform="translate(36 120)">
              {/* Remorque et colis */}
              <path d="M150 54 h22" stroke="#2a2622" strokeWidth="5" strokeLinecap="round" />
              <rect x="0" y="40" width="152" height="12" rx="3" fill="#2a2622" />
              <rect x="4" y="30" width="144" height="12" rx="2" fill="#b9653c" />
              <circle cx="76" cy="64" r="18" fill="#1f1c19" />
              <circle cx="76" cy="64" r="8" fill="#d9cfc0" />
              <g>
                <rect x="30" y="-24" width="92" height="56" rx="4" fill="#c9a26b" />
                <rect x="30" y="-24" width="92" height="12" rx="3" fill="#b78f58" />
                <rect x="70" y="-24" width="12" height="56" fill="#e0875a" />
                <path d="M44 6h18M44 13h12" stroke="#7a5a32" strokeWidth="2.5" strokeLinecap="round" />
              </g>
            </g>
          ) : null}
        </g>
      </g>
    </svg>
  );
}

export function Celebration({
  title,
  subtitle,
  withParcel = false,
  onClose,
  children,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  withParcel?: boolean;
  onClose: () => void;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [confetti, setConfetti] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Le premier bouton reçoit le focus, pour le clavier et les lecteurs d'écran.
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>('a[href], button')?.focus({ preventScroll: true }), 900);
    const stop = setTimeout(() => setConfetti(false), 6000);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      clearTimeout(t);
      clearTimeout(stop);
    };
  }, [onClose]);

  return (
    <div className="celebrate" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="celebrate-backdrop" onClick={onClose} />
      {confetti ? <Confetti /> : null}
      <div ref={panel} className="celebrate-panel">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-3 top-3 z-10 flex size-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur transition hover:bg-black/50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <CelebrationScene withParcel={withParcel} />
        <div className="flex flex-col gap-4 p-5 sm:p-7">
          <div className="celebrate-rise" style={{ animationDelay: '900ms' }}>
            <h2 id={titleId} className="font-display text-[28px] font-bold leading-tight tracking-tight sm:text-3xl">{title}</h2>
            {subtitle ? <p className="mt-1.5 text-muted">{subtitle}</p> : null}
          </div>
          {children ? <div className="celebrate-rise" style={{ animationDelay: '1150ms' }}>{children}</div> : null}
          {actions ? <div className="celebrate-rise flex flex-wrap gap-3" style={{ animationDelay: '1400ms' }}>{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}
