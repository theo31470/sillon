import Image from 'next/image';
import Link from 'next/link';
import type { FleetMachine } from '@/lib/fleet';
import { dueLabel, type MaintenanceDue } from '@/lib/maintenance';
import { euros } from '@/lib/costs';
import { formatNumber } from '@/lib/format';
import { MACHINE_KINDS } from '@/lib/types';
import { MachineScene } from '@/components/sheets/machine-art';
import { Icon } from '@/components/sheets/icons';

/** Éléments d'interface du parc matériel. */

export const STATUS_STYLE: Record<MaintenanceDue['status'], { bar: string; text: string; bg: string; label: string }> = {
  retard: { bar: 'bg-danger', text: 'text-danger', bg: 'bg-danger-soft', label: 'En retard' },
  bientot: { bar: 'bg-wheat', text: 'text-warn', bg: 'bg-warn-soft', label: 'Bientôt' },
  ok: { bar: 'bg-success', text: 'text-success', bg: 'bg-success-soft', label: 'À jour' },
};

export function MachinePicture({ m, className = '' }: { m: Pick<FleetMachine, 'id' | 'name' | 'art' | 'sheet'>; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-photo ${className}`}>
      {m.sheet?.cover_url ? (
        <Image src={m.sheet.cover_url} alt="" fill sizes="320px" className="object-cover" />
      ) : (
        <MachineScene kind={m.art} uid={`m-${m.id}`} label="" className="size-full" />
      )}
    </div>
  );
}

/** Jauge « usure » avant la prochaine échéance. */
export function DueBar({ due }: { due: MaintenanceDue }) {
  const s = STATUS_STYLE[due.status];
  return (
    <div className="h-2 overflow-hidden rounded-full bg-line">
      <div className={`h-full rounded-full ${s.bar} transition-[width] duration-700`} style={{ width: `${Math.max(4, (1 - due.progress) * 100)}%` }} />
    </div>
  );
}

export function MachineCard({ m }: { m: FleetMachine }) {
  const next = m.due[0];
  const late = m.due.filter((d) => d.status === 'retard').length;
  return (
    <Link href={`/app/materiel/${m.id}`} transitionTypes={['nav-forward']} className="sheet-card group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink">
      <MachinePicture m={m} className="h-36" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold leading-snug">{m.name}</h3>
            <p className="truncate text-sm text-muted">{[m.brand, m.model].filter(Boolean).join(' ') || MACHINE_KINDS[m.kind]}</p>
          </div>
          <p className="flex-none rounded-lg bg-admin px-2 py-1 font-mono text-sm font-semibold tabular-nums text-white">{formatNumber(Number(m.hours), 0)} h</p>
        </div>
        {next ? (
          <div>
            <div className="mb-1.5 flex justify-between gap-2 text-sm">
              <span className="truncate">{next.operation}</span>
              <span className={`flex-none font-semibold ${STATUS_STYLE[next.status].text}`}>{dueLabel(next)}</span>
            </div>
            <DueBar due={next} />
          </div>
        ) : (
          <p className="text-sm text-muted">Pas encore de plan d’entretien.</p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs font-semibold">
          {late ? <span className="rounded-full bg-danger-soft px-2 py-0.5 text-danger">{late} en retard</span> : null}
          {m.economics.perHour ? (
            <span className="rounded-full bg-wheat-soft px-2 py-0.5 text-soil">{euros(m.economics.perHour.total, 2)} / h</span>
          ) : null}
          <span className="ml-auto text-brand transition-transform group-hover:translate-x-0.5">Ouvrir →</span>
        </div>
      </div>
    </Link>
  );
}

export function Kpi({ icon, label, value, sub }: { icon: Parameters<typeof Icon>[0]['name']; label: string; value: string; sub?: string }) {
  return (
    <div className="lift-card flex flex-col items-start gap-2 rounded-2xl border border-line bg-surface p-3.5 sm:flex-row sm:items-center sm:gap-3.5 sm:p-4">
      <span className="flex size-9 flex-none items-center justify-center rounded-full bg-wheat-soft text-soil sm:size-11">
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0 max-w-full">
        <p className="text-[11px] font-semibold uppercase leading-tight tracking-wider text-muted sm:text-xs">{label}</p>
        <p className="text-2xl font-bold leading-tight tabular-nums">{value}</p>
        {sub ? <p className="truncate text-sm text-muted">{sub}</p> : null}
      </div>
    </div>
  );
}
