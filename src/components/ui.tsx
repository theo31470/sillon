import type { ComponentProps, ReactNode } from 'react';

/** Petits composants d'interface partagés, au style des maquettes. */

export const btn = {
  primary:
    'btn btn-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] bg-brand px-5 py-3 font-semibold text-on-brand hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50',
  secondary:
    'btn inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] border border-field bg-surface px-5 py-3 font-semibold text-ink hover:border-brand hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-50',
  danger:
    'btn inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-danger/40 bg-surface px-4 py-2.5 font-semibold text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50',
  small:
    'btn inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-field bg-surface px-3.5 py-2 text-sm font-semibold text-ink hover:border-brand hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-50',
};

export const inputClass =
  'w-full min-h-12 rounded-[10px] border border-field bg-surface px-3.5 py-2.5 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function Select(props: ComponentProps<'select'>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea {...props} className={`${inputClass} min-h-28 ${props.className ?? ''}`} />;
}

const badgeTones = {
  green: 'bg-success-soft text-success',
  amber: 'bg-warn-soft text-warn',
  blue: 'bg-info-soft text-info',
  red: 'bg-danger-soft text-danger',
  gray: 'bg-ground text-muted',
};

export function Badge({ tone = 'gray', children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface p-6 ${className}`}>{children}</section>;
}

export function Notice({ tone = 'amber', children }: { tone?: 'amber' | 'green' | 'red' | 'gray'; children: ReactNode }) {
  const tones = {
    amber: 'bg-warn-soft text-warn',
    green: 'bg-success-soft text-success',
    red: 'bg-danger-soft text-danger',
    gray: 'bg-ground text-muted',
  };
  return <p className={`rounded-[10px] px-4 py-3 text-sm ${tones[tone]}`}>{children}</p>;
}

/** Emplacement photo tant que les vraies images ne sont pas fournies. */
export function PhotoSlot({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl bg-photo p-4 text-center text-sm text-muted transition-transform duration-500 ${className}`}
      role="img"
      aria-label={label}
    >
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="11" r="2" />
        <path d="M21 17l-5-5-9 7" />
      </svg>
      {label}
    </div>
  );
}

/** Proportions des fichiers du logo (public/brand). */
const LOGOS = {
  horizontal: { file: 'logo', ratio: 1486 / 379 },
  vertical: { file: 'logo-vertical', ratio: 2400 / 2273 },
  embleme: { file: 'embleme', ratio: 1 },
  icone: { file: 'icone', ratio: 2400 / 2120 },
} as const;

/**
 * Logo Tracteurs & Co. Deux fichiers par déclinaison : texte blanc (mode sombre)
 * et texte foncé (mode clair) ; la feuille de style n'affiche que le bon.
 * `tone="dark"` force la version blanche (panneaux toujours sombres).
 */
export function Logo({
  variant = 'horizontal',
  height = 34,
  tone = 'auto',
  className = '',
}: {
  variant?: keyof typeof LOGOS;
  height?: number;
  tone?: 'auto' | 'dark' | 'light';
  className?: string;
}) {
  const { file, ratio } = LOGOS[variant];
  const width = Math.round(height * ratio);
  // eslint-disable-next-line @next/next/no-img-element -- SVG statique, déjà optimisé
  const img = (theme: 'sombre' | 'clair', cls: string) => <img src={`/brand/${file}-${theme}.svg`} alt="" width={width} height={height} className={`block h-auto max-w-full ${cls}`} style={{ width }} />;
  return (
    <span className={`inline-flex ${className}`} role="img" aria-label="Tracteurs & Co, machinisme agricole">
      {tone === 'dark' ? img('sombre', '') : tone === 'light' ? img('clair', '') : (
        <>
          {img('sombre', 'only-dark')}
          {img('clair', 'only-light')}
        </>
      )}
    </span>
  );
}

export function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
