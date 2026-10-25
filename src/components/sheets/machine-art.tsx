import type { MachineKind } from '@/lib/sheets/insights';

/**
 * Illustrations des fiches (dessins originaux, en attendant les vraies photos) :
 * un champ labouré avec la silhouette du type de machine.
 */

// Couleurs de la charte Tracteurs & Co : carrosserie terre cuite, jantes beige.
const C = {
  body: '#e0875a',
  bodyDark: '#b9653c',
  rim: '#d9cfc0',
  rimDark: '#a99d8c',
  tire: '#1f1c19',
  tread: '#0f0e0c',
  steel: '#2a2622',
  glass: '#b9d0d8',
  glassHi: '#e6f0f3',
  light: '#f0b860',
};

function Wheel({ cx, cy, r, rim }: { cx: number; cy: number; r: number; rim: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={C.tire} />
      <circle cx={cx} cy={cy} r={r - 2} fill="none" stroke={C.tread} strokeWidth="5" strokeDasharray="5 5" />
      <circle cx={cx} cy={cy} r={rim} fill={C.rim} />
      <circle cx={cx} cy={cy} r={rim * 0.62} fill="none" stroke={C.rimDark} strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={rim * 0.32} fill={C.rimDark} />
    </g>
  );
}

export function Tracteur() {
  return (
    <g>
      <Wheel cx={258} cy={142} r={28} rim={14} />
      <path d="M22 142 30 128" stroke={C.steel} strokeWidth="5" strokeLinecap="round" />
      <path d="M118 120h150v12H118z" fill={C.steel} />
      <path d="M128 84h142c10 0 18 7 18 17v21H128z" fill={C.body} />
      <path d="M136 92h128" stroke="#f0a57e" strokeWidth="3" strokeLinecap="round" />
      <path d="M280 92h7v26h-7z" fill={C.bodyDark} />
      <path d="M282 97h4M282 103h4M282 109h4" stroke="#8a4a2b" strokeWidth="1.5" />
      <rect x="288" y="104" width="14" height="18" rx="2" fill={C.steel} />
      <path d="M196 54h6v32h-6z" fill={C.steel} />
      <path d="M194 52h10v4h-10z" fill={C.steel} />
      <Wheel cx={88} cy={124} r={46} rim={24} />
      <path d="M32 118c3-34 27-54 56-54s52 18 58 48" fill="none" stroke={C.body} strokeWidth="9" strokeLinecap="round" />
      <path d="M60 92h74v32H60z" fill={C.body} />
      <path d="M66 38h88v58H66z" fill={C.steel} />
      <path d="M70 41h36v51H70z" fill={C.glass} />
      <path d="M112 41h38v51h-38z" fill={C.glass} />
      <path d="M74 45l14 0-12 20z" fill={C.glassHi} />
      <path d="M116 45l14 0-12 20z" fill={C.glassHi} />
      <path d="M58 30h102l5 9H53z" fill={C.bodyDark} />
      <path d="M100 24h9v6h-9z" fill={C.light} />
      <path d="M134 122h14v4h-14z" fill={C.steel} />
    </g>
  );
}

function Moissonneuse() {
  return (
    <g>
      <path d="M232 92 266 118l-9 14-33-26z" fill={C.bodyDark} />
      <path d="M250 124h62v22h-62z" fill={C.rim} />
      <path d="M250 146h66" stroke={C.steel} strokeWidth="4" strokeLinecap="round" />
      <circle cx={290} cy={112} r={20} fill="none" stroke={C.bodyDark} strokeWidth="3" />
      <path d="M290 92v40M270 112h40M276 98l28 28M304 98l-28 28" stroke={C.bodyDark} strokeWidth="2" />
      <path d="M248 112h22" stroke={C.steel} strokeWidth="3" />
      <path d="M40 70h192v58H40z" fill={C.body} />
      <path d="M48 82h120" stroke="#f0a57e" strokeWidth="3" strokeLinecap="round" />
      <path d="M68 46h122l12 24H56z" fill={C.bodyDark} />
      <path d="M26 58h140v7H26z" fill={C.steel} />
      <path d="M26 58v22" stroke={C.steel} strokeWidth="7" strokeLinecap="round" />
      <path d="M198 34h56v42h-56z" fill={C.steel} />
      <path d="M202 38h48v34h-48z" fill={C.glass} />
      <path d="M206 42h14l-11 18z" fill={C.glassHi} />
      <path d="M194 28h64l3 7h-70z" fill={C.bodyDark} />
      <path d="M222 22h8v6h-8z" fill={C.light} />
      <path d="M150 40h6v30h-6z" fill={C.steel} />
      <Wheel cx={70} cy={146} r={24} rim={11} />
      <Wheel cx={190} cy={128} r={42} rim={21} />
    </g>
  );
}

function Motoculteur() {
  return (
    <g>
      <path d="M176 100 84 52" stroke={C.steel} strokeWidth="8" strokeLinecap="round" />
      <path d="M86 53 62 44" stroke="#3a3530" strokeWidth="11" strokeLinecap="round" />
      <path d="M120 72l-10 14" stroke={C.steel} strokeWidth="4" strokeLinecap="round" />
      <path d="M180 104h22v36h-22z" fill={C.steel} />
      <path d="M166 70h60c4 0 6 2 6 6v34h-72V76c0-4 2-6 6-6z" fill={C.body} />
      <path d="M174 58h38c3 0 5 2 5 5v9h-48v-9c0-3 2-5 5-5z" fill={C.rim} />
      <circle cx={218} cy={90} r={9} fill={C.bodyDark} />
      <path d="M232 98h16v10h-16z" fill={C.steel} />
      <path d="M160 116h16v8h-16z" fill={C.steel} />
      <Wheel cx={190} cy={138} r={32} rim={13} />
    </g>
  );
}

function Pulverisateur() {
  return (
    <g>
      <path d="M62 128 12 142" stroke={C.body} strokeWidth="8" strokeLinecap="round" />
      <path d="M58 122h200v12H58z" fill={C.body} />
      <rect x="70" y="56" width="170" height="70" rx="32" fill="#efe9df" stroke="#c9c1b5" strokeWidth="2" />
      <path d="M96 70v44M96 80h6M96 92h6M96 104h6" stroke="#c9c1b5" strokeWidth="2" />
      <path d="M140 50h22v8h-22z" fill={C.bodyDark} />
      <path d="M244 46h14v90h-14z" fill={C.bodyDark} />
      <path d="M244 140h16M248 140v6M256 140v6" stroke={C.steel} strokeWidth="2" />
      <Wheel cx={150} cy={138} r={30} rim={14} />
    </g>
  );
}

function Outil() {
  const bodies = [96, 166, 236];
  return (
    <g>
      <path d="M22 40h26l-8 64" fill="none" stroke={C.body} strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M30 76 292 108" stroke={C.body} strokeWidth="12" strokeLinecap="round" />
      {bodies.map((x) => {
        const y = 76 + ((x - 30) * 32) / 262;
        return (
          <g key={x}>
            <path d={`M${x} ${y}l8 46`} stroke={C.steel} strokeWidth="7" strokeLinecap="round" />
            <path d={`M${x - 4} ${y + 30}c18 0 34 8 40 26l-32 6c-6-10-8-20-8-32z`} fill={C.bodyDark} />
            <path d={`M${x + 4} ${y + 56}l34 6`} stroke="#a99d8c" strokeWidth="4" strokeLinecap="round" />
          </g>
        );
      })}
      <path d="M292 108l14 22" stroke={C.steel} strokeWidth="5" strokeLinecap="round" />
      <Wheel cx={306} cy={146} r={20} rim={9} />
    </g>
  );
}

const MACHINES: Record<MachineKind, () => React.JSX.Element> = {
  tracteur: Tracteur,
  moissonneuse: Moissonneuse,
  motoculteur: Motoculteur,
  pulverisateur: Pulverisateur,
  outil: Outil,
};

/** Champ labouré vu en perspective, avec la machine au premier plan. */
export function MachineScene({
  kind,
  uid,
  label,
  className = '',
  tall = false,
}: {
  kind: MachineKind;
  uid: string;
  label: string;
  className?: string;
  /** Cadre plus haut que large : on montre plus de ciel. */
  tall?: boolean;
}) {
  const Machine = MACHINES[kind];
  const sky = `sky-${uid}`;
  const field = `field-${uid}`;
  const vx = 240;
  const furrows = Array.from({ length: 17 }, (_, i) => -560 + i * 100);
  return (
    <svg viewBox={tall ? '0 -90 480 390' : '0 0 480 300'} preserveAspectRatio="xMidYMax slice" role="img" aria-label={label} className={className}>
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--art-sky-top)' }} />
          <stop offset="1" style={{ stopColor: 'var(--art-sky-bottom)' }} />
        </linearGradient>
        <linearGradient id={field} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--art-field-top)' }} />
          <stop offset="1" style={{ stopColor: 'var(--art-field-bottom)' }} />
        </linearGradient>
      </defs>
      <rect y="-120" width="480" height="420" fill={`url(#${sky})`} />
      <circle cx="392" cy="62" r="26" style={{ fill: 'var(--art-sun)', opacity: 'var(--art-sun-opacity)' }} />
      <path d="M0 160c70-30 140-32 220-14s170 2 260-20v54H0z" style={{ fill: 'var(--art-hill-far)' }} />
      <path d="M0 172c90-20 170-8 250 0s160-8 230-14v20H0z" style={{ fill: 'var(--art-hill-near)' }} />
      <path d="M0 178h480v122H0z" fill={`url(#${field})`} />
      <g strokeWidth="1.6" opacity="0.9" style={{ stroke: 'var(--art-furrow)' }}>
        {furrows.map((x) => (
          <path key={x} d={`M${vx + (x - vx) * 0.04} 178 L${x} 300`} />
        ))}
      </g>
      <path d="M0 178h480" strokeWidth="2" style={{ stroke: 'var(--art-horizon)' }} />
      <g className="machine-drive">
        <ellipse cx="240" cy="268" rx="150" ry="7" opacity="0.22" style={{ fill: 'var(--art-shadow)' }} />
        <g transform="translate(80 98)">
          <Machine />
        </g>
      </g>
    </svg>
  );
}

/** Frise de sillons décorative (bas des en-têtes). */
export function FurrowBand({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true" className={className}>
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M0 ${8 + i * 9} C 150 ${2 + i * 9}, 300 ${14 + i * 9}, 450 ${8 + i * 9} S 750 ${2 + i * 9}, 900 ${8 + i * 9} S 1100 ${14 + i * 9}, 1200 ${8 + i * 9}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity={0.9 - i * 0.18}
        />
      ))}
    </svg>
  );
}
