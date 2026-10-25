import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { daysSinceReading, getFleet } from '@/lib/fleet';
import { dueLabel } from '@/lib/maintenance';
import { euros } from '@/lib/costs';
import { daysAgoIso, formatDate, formatNumber } from '@/lib/format';
import { COST_KINDS } from '@/lib/types';
import { Card, btn } from '@/components/ui';
import { Kpi, MachineCard, STATUS_STYLE } from '@/components/fleet';
import { Icon } from '@/components/sheets/icons';

export const metadata: Metadata = { title: 'Tableau de bord' };

export default async function DashboardPage() {
  const { profile } = await requireUser();
  const fleet = await getFleet();
  const firstName = profile.full_name.split(' ')[0] || '';

  if (fleet.length === 0) {
    return (
      <>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bienvenue{firstName ? ` ${firstName}` : ''} !</h1>
          <p className="text-muted">Votre carnet de santé du matériel agricole commence ici.</p>
        </div>
        <Card className="flex flex-col gap-6 border-brand/30 bg-brand-tint p-8">
          <ol className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            {[
              ['tag', 'Ajoutez votre première machine', 'Choisissez son modèle : le plan d’entretien est repris de la fiche technique.'],
              ['clock', 'Relevez le compteur', 'Une fois par semaine ou par mois : Tracteurs & Co calcule vos heures de travail.'],
              ['wrench', 'Notez entretiens et dépenses', 'Vous voyez ce qui arrive, et ce que coûte vraiment chaque heure.'],
            ].map(([icon, title, text], i) => (
              <li key={title} className="flex gap-3.5">
                <span className="flex size-10 flex-none items-center justify-center rounded-full bg-brand font-bold text-on-brand">{i + 1}</span>
                <div>
                  <p className="flex items-center gap-1.5 font-semibold"><Icon name={icon as 'tag'} size={16} className="text-brand" /> {title}</p>
                  <p className="text-sm text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-3">
            <Link href="/app/materiel#ajouter" className={btn.primary}>+ Ajouter ma première machine</Link>
            <Link href="/fiches" className={btn.secondary}>Parcourir les fiches techniques</Link>
          </div>
        </Card>
      </>
    );
  }

  // Indicateurs du parc
  const dues = fleet.flatMap((m) => m.due.filter((d) => d.status !== 'ok').map((d) => ({ ...d, machine: m })));
  dues.sort((a, b) => a.progress - b.progress);
  const lateCount = dues.filter((d) => d.status === 'retard').length;
  const since = daysAgoIso(365).slice(0, 10);
  const spent = fleet.flatMap((m) => m.costs).filter((c) => c.spent_on >= since).reduce((s, c) => s + Number(c.amount), 0);
  const hoursYear = fleet.reduce((s, m) => s + (m.economics.hoursWorked ?? 0), 0);
  const staleReadings = fleet.filter((m) => daysSinceReading(m) > 30);

  // Activité récente (entretiens, dépenses, relevés)
  const activity = [
    ...fleet.flatMap((m) => m.logs.map((l) => ({ day: l.done_on, machine: m, icon: 'wrench' as const, text: l.operation, detail: `${formatNumber(Number(l.done_at_hours), 0)} h` }))),
    ...fleet.flatMap((m) =>
      m.costs.filter((c) => c.kind !== 'entretien').map((c) => ({ day: c.spent_on, machine: m, icon: 'can' as const, text: `${COST_KINDS[c.kind]}${c.label ? ` · ${c.label}` : ''}`, detail: euros(Number(c.amount)) })),
    ),
  ]
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 8);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bonjour{firstName ? ` ${firstName}` : ''}</h1>
          <p className="text-muted">{formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: undefined })} · {fleet.length} machine{fleet.length > 1 ? 's' : ''} dans votre parc</p>
        </div>
        <Link href="/app/materiel#ajouter" className={btn.primary}>+ Ajouter une machine</Link>
      </div>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        <Kpi icon="warning" label="Entretiens à prévoir" value={String(dues.length)} sub={lateCount ? `dont ${lateCount} en retard` : 'aucun en retard'} />
        <Kpi icon="clock" label="Heures sur 12 mois" value={`${formatNumber(hoursYear, 0)} h`} sub="d’après vos relevés" />
        <Kpi icon="can" label="Dépenses sur 12 mois" value={euros(spent)} sub="HT, tout le parc" />
        <Kpi icon="tag" label="Machines" value={String(fleet.length)} sub={profile.plan === 'free' ? 'formule gratuite' : 'parc illimité'} />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Card className="min-w-0 flex-[1_1_520px]">
          <h2 className="mb-4 text-xl font-semibold">À faire</h2>
          {dues.length === 0 && staleReadings.length === 0 ? (
            <p className="flex items-center gap-2 text-muted"><Icon name="check" size={18} className="text-brand" /> Tout est à jour. Bonne semaine !</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {dues.slice(0, 8).map((d) => (
                <li key={`${d.machine.id}-${d.operation}`}>
                  <Link href={`/app/materiel/${d.machine.id}#entretien`} className={`flex items-center gap-4 rounded-xl px-4 py-3 transition-transform hover:translate-x-0.5 ${STATUS_STYLE[d.status].bg}`}>
                    <Icon name={d.status === 'retard' ? 'warning' : 'clock'} size={20} className={STATUS_STYLE[d.status].text} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{d.operation}</p>
                      <p className="text-sm text-muted">{d.machine.name} · {dueLabel(d)}</p>
                    </div>
                    <span className="font-semibold text-brand">Voir</span>
                  </Link>
                </li>
              ))}
              {staleReadings.slice(0, 4).map((m) => (
                <li key={`releve-${m.id}`}>
                  <Link href={`/app/materiel/${m.id}#compteur`} className="flex items-center gap-4 rounded-xl bg-ground px-4 py-3 transition-transform hover:translate-x-0.5">
                    <Icon name="clock" size={20} className="text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">Relever le compteur</p>
                      <p className="text-sm text-muted">{m.name} · dernier relevé il y a {daysSinceReading(m)} jours</p>
                    </div>
                    <span className="font-semibold text-brand">Relever</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="min-w-0 flex-[1_1_340px]">
          <h2 className="mb-2 text-xl font-semibold">Dernière activité</h2>
          {activity.length === 0 ? (
            <p className="text-muted">Notez vos entretiens et dépenses depuis la page de chaque machine.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {activity.map((a, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <Icon name={a.icon} size={18} className="flex-none text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.text}</p>
                    <p className="truncate text-sm text-muted">{a.machine.name} · {formatDate(a.day, { year: undefined })}</p>
                  </div>
                  <span className="flex-none text-sm font-semibold tabular-nums">{a.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Mon parc</h2>
          <Link href="/app/materiel" className="font-semibold text-brand">Tout le parc →</Link>
        </div>
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {fleet.map((m) => <MachineCard key={m.id} m={m} />)}
        </div>
      </section>
    </>
  );
}
