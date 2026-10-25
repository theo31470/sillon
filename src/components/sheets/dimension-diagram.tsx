import type { Dimensions } from '@/lib/sheets/insights';
import { Tracteur } from './machine-art';

/** Schéma de gabarit coté, façon plan d'atelier (tracteurs uniquement). */
export function DimensionDiagram({ dims }: { dims: Dimensions }) {
  // Repères du dessin du tracteur (coordonnées locales, décalées de 50/40).
  const ox = 50;
  const oy = 40;
  const ground = oy + 170;
  const front = ox + 302;
  const back = ox + 22;
  const top = oy + 24;
  const rearAxle = ox + 88;
  const frontAxle = ox + 258;
  const ink = 'var(--art-ink)';

  const arrow = (x1: number, y1: number, x2: number, y2: number) => (
    <g strokeWidth="1.3" fill="none" style={{ stroke: ink }}>
      <path d={`M${x1} ${y1}L${x2} ${y2}`} />
      {x1 === x2 ? (
        <>
          <path d={`M${x1 - 4} ${y1 + 6}L${x1} ${y1}L${x1 + 4} ${y1 + 6}`} />
          <path d={`M${x2 - 4} ${y2 - 6}L${x2} ${y2}L${x2 + 4} ${y2 - 6}`} />
        </>
      ) : (
        <>
          <path d={`M${x1 + 6} ${y1 - 4}L${x1} ${y1}L${x1 + 6} ${y1 + 4}`} />
          <path d={`M${x2 - 6} ${y2 - 4}L${x2} ${y2}L${x2 - 6} ${y2 + 4}`} />
        </>
      )}
    </g>
  );
  const label = (x: number, y: number, text: string, rotate = false) => (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      transform={rotate ? `rotate(-90 ${x} ${y})` : undefined}
      className="fill-ink text-[12px] font-semibold"
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {text}
    </text>
  );

  return (
    <svg viewBox="0 0 440 280" className="h-auto w-full" role="img" aria-label="Schéma des dimensions de la machine">
      <defs>
        <pattern id="grid-plan" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" strokeWidth="1" style={{ stroke: 'var(--art-grid)' }} />
        </pattern>
      </defs>
      <rect width="440" height="280" fill="url(#grid-plan)" />
      <path d={`M20 ${ground}H420`} strokeWidth="2" style={{ stroke: 'var(--art-ground-line)' }} />
      <g transform={`translate(${ox} ${oy})`} opacity="0.92">
        <Tracteur />
      </g>
      <g strokeWidth="1" strokeDasharray="3 3" style={{ stroke: ink }}>
        {dims.length ? <path d={`M${back} ${ground}V${ground + 52}M${front} ${ground}V${ground + 52}`} /> : null}
        {dims.wheelbase ? <path d={`M${rearAxle} ${oy + 124}V${ground + 28}M${frontAxle} ${oy + 142}V${ground + 28}`} /> : null}
        {dims.height ? <path d={`M${ox + 160} ${top}H${front + 40}`} /> : null}
      </g>
      {dims.wheelbase ? (
        <>
          {arrow(rearAxle, ground + 22, frontAxle, ground + 22)}
          {label((rearAxle + frontAxle) / 2, ground + 17, `Empattement ${dims.wheelbase}`)}
        </>
      ) : null}
      {dims.length ? (
        <>
          {arrow(back, ground + 48, front, ground + 48)}
          {label((back + front) / 2, ground + 43, `Longueur ${dims.length}`)}
        </>
      ) : null}
      {dims.height ? (
        <>
          {arrow(front + 34, top, front + 34, ground)}
          {label(front + 24, (top + ground) / 2, `Hauteur ${dims.height}`, true)}
        </>
      ) : null}
    </svg>
  );
}
