import type { ReactNode } from 'react';
import type { GroupIcon } from '@/lib/sheets/insights';

/** Pictogrammes au trait des fiches techniques (dessinés pour Tracteurs & Co). */

function Svg({ children, size = 22, className = '' }: { children: ReactNode; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

const paths: Record<GroupIcon | 'power' | 'speed' | 'fuel' | 'warning' | 'check' | 'tag' | 'clock' | 'calendar' | 'book' | 'print' | 'copy' | 'chevron' | 'spark', ReactNode> = {
  engine: (
    <>
      <path d="M4 10h2V8h3V6h5v2h2l2 2h2v6h-2l-2 2H8l-2-2H4z" />
      <path d="M2 11v4M9 6V4h4v2M11 11v3" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  drop: (
    <>
      <path d="M12 3s6 6.4 6 10.5a6 6 0 0 1-12 0C6 9.4 12 3 12 3z" />
      <path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5" />
    </>
  ),
  hitch: (
    <>
      <path d="M4 20h16M7 20V9l5-4 5 4v11" />
      <path d="M7 13h10M12 5v15" />
    </>
  ),
  wheel: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  ruler: (
    <>
      <path d="M3 16 16 3l5 5L8 21z" />
      <path d="m7 12 2 2M10 9l1.5 1.5M13 6l2 2" />
    </>
  ),
  weight: (
    <>
      <path d="M9 7a3 3 0 1 1 6 0" />
      <path d="M6 7h12l2 13H4z" />
    </>
  ),
  cabin: (
    <>
      <path d="M5 21V5h11l3 6v10" />
      <path d="M5 11h14M9 5v6" />
    </>
  ),
  bolt: <path d="M13 2 5 13h6l-1 9 8-11h-6z" />,
  can: (
    <>
      <path d="M6 6h9l3 3v12H6z" />
      <path d="M9 3h4v3M10 13h4M12 11v4" />
    </>
  ),
  blade: (
    <>
      <path d="M12 21V9" />
      <path d="M12 9c0-3 2-5 2-5s2 2 0 5M12 13c-2-1-4-3-3-6 2 0 3 3 3 6zM12 13c2-1 4-3 3-6-2 0-3 3-3 6zM12 17c-2-1-4-3-3-6 2 0 3 3 3 6zM12 17c2-1 4-3 3-6-2 0-3 3-3 6z" />
    </>
  ),
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L3 18l3 3 6.5-6.5a4 4 0 0 0 5.2-5.2l-2.5 2.5-2.5-.5-.5-2.5z" />,
  power: (
    <>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="m12 17 4-5M7 17h.01M17 17h.01" />
    </>
  ),
  speed: (
    <>
      <path d="M3 17a9 9 0 0 1 18 0" />
      <path d="m12 17 5-6M3 17h3M18 17h3M12 8v2" />
    </>
  ),
  fuel: (
    <>
      <path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M6 9h6" />
      <path d="M14 11h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  tag: (
    <>
      <path d="M3 12V4h8l10 10-8 8z" />
      <circle cx="7.5" cy="8.5" r="1.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  book: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 21h16M9 7h7" />
    </>
  ),
  print: (
    <>
      <path d="M7 9V3h10v6M7 17H4v-7h16v7h-3" />
      <path d="M7 14h10v7H7z" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
};

export type IconName = keyof typeof paths;

export function Icon({ name, size, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      {paths[name]}
    </Svg>
  );
}

export const FIGURE_ICONS: Record<string, IconName> = {
  power: 'power',
  weight: 'weight',
  speed: 'speed',
  width: 'ruler',
  fuel: 'fuel',
  tank: 'can',
  hydraulic: 'drop',
  lift: 'hitch',
  displacement: 'engine',
};
