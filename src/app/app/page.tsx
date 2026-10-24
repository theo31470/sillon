import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getInterventions, getMachinesWithMaintenance, getParcels } from '@/lib/farm-data';
import { getForecast, weatherLabel, type Forecast } from '@/lib/weather';
import { formatDate, formatNumber } from '@/lib/format';
import { INTERVENTION_KINDS } from '@/lib/types';
import { Card, btn } from '@/components/ui';

export const metadata: Metadata = { title: 'Tableau de bord' };

type Todo = { tone: 'amber' | 'gray' | 'green'; title: string; detail: string; href?: string; cta?: string };

const dayName = (iso: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'Europe/Paris' }).format(new Date(`${iso}T12:00:00`));

export default async function DashboardPage() {
  const { profile } = await requireUser();
  const [parcels, recent, machines] = await Promise.all([getParcels(), getInterventions({ limit: 6 }), getMachinesWithMaintenance()]);
  const forecast: Forecast | null =
    profile.latitude !== null && profile.longitude !== null ? await getForecast(profile.latitude, profile.longitude) : null;

  const parcelName = new Map(parcels.map((p) => [p.id, p.name]));
  const totalHa = parcels.reduce((sum, p) => sum + Number(p.area_ha), 0);

  // Liste « À faire cette semaine »
  const todos: Todo[] = [];
  for (const m of machines) {
    for (const d of m.due.filter((d) => d.remainingHours <= 25)) {
      todos.push({
        tone: 'amber',
        title: `${d.operation} — ${m.name}`,
        detail: d.remainingHours <= 0 ? `En retard de ${formatNumber(-d.remainingHours)} h` : `Dans ${formatNumber(d.remainingHours)} heures de travail`,
        href: '/app/materiel',
        cta: 'Voir',
      });
    }
  }
  const frostDay = forecast?.days.slice(1).find((d) => d.frost);
  if (frostDay) {
    todos.push({ tone: 'amber', title: `Risque de gel ${dayName(frostDay.date)}`, detail: `Minimum prévu : ${formatNumber(frostDay.tMin)} °C`, href: '/app#meteo', cta: 'Voir' });
  }
  for (const i of recent.filter((i) => i.kind === 'traitement' && (!i.product || i.dose === null)).slice(0, 3)) {
    todos.push({
      tone: 'gray',
      title: `Compléter le traitement du ${formatDate(i.done_on, { day: '2-digit', month: '2-digit', year: undefined })}`,
      detail: `${parcelName.get(i.parcel_id) ?? 'Parcelle'} · produit ou dose manquant`,
      href: '/app/interventions',
      cta: 'Compléter',
    });
  }
  const sprayDay = forecast?.days.find((d) => d.sprayOk);
  if (sprayDay) {
    todos.push({ tone: 'green', title: `Bon moment pour traiter : ${dayName(sprayDay.date)}`, detail: `Vent max ${formatNumber(sprayDay.windMaxKmh, 0)} km/h, pas de pluie prévue` });
  }

  const toneClass = { amber: 'bg-warn-soft', gray: 'bg-ground', green: 'bg-brand-tint' };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bonjour {profile.full_name.split(' ')[0] || ''}</h1>
          <p className="text-muted">
            {formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: undefined })}
            {forecast ? ` · ${formatNumber(forecast.current.temperature, 0)} °C, ${weatherLabel(forecast.current.code).toLowerCase()}` : ''}
          </p>
        </div>
        <Link href="/app/interventions#nouvelle" className={`${btn.primary} text-lg`}>+ Noter une intervention</Link>
      </div>

      {parcels.length === 0 ? (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-brand bg-brand-tint">
          <div>
            <h2 className="text-xl font-semibold">Bienvenue ! Commencez par ajouter vos parcelles.</h2>
            <p className="text-muted">Deux minutes suffisent : nom, culture et surface.</p>
          </div>
          <Link href="/app/parcelles" className={btn.primary}>Ajouter mes parcelles</Link>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-start gap-6">
        <Card className="min-w-0 flex-[1_1_520px]">
          <h2 className="mb-4 text-xl font-semibold">À faire cette semaine</h2>
          {todos.length === 0 ? (
            <p className="text-muted">Rien d’urgent. Bonne semaine !</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {todos.map((t) => (
                <li key={t.title} className={`flex items-center gap-4 rounded-xl px-4 py-3.5 ${toneClass[t.tone]}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{t.title}</p>
                    <p className="text-sm text-muted">{t.detail}</p>
                  </div>
                  {t.href ? <Link href={t.href} className="font-semibold text-brand">{t.cta}</Link> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="min-w-0 flex-[1_1_340px]">
          <h2 id="meteo" className="mb-4 text-xl font-semibold">Météo</h2>
          {forecast ? (
            <>
              <p className="mb-1 text-4xl font-bold">{formatNumber(forecast.current.temperature, 0)}°</p>
              <p className="mb-4 text-muted">{weatherLabel(forecast.current.code)} · vent {formatNumber(forecast.current.windKmh, 0)} km/h</p>
              <div className="grid grid-cols-5 gap-1.5 text-center text-sm">
                {forecast.days.slice(1, 6).map((d) => (
                  <div key={d.date} className={`rounded-[10px] py-2.5 ${d.frost ? 'bg-warn-soft' : d.sprayOk ? 'bg-brand-soft' : 'bg-ground'}`}>
                    <p className="capitalize text-muted">{dayName(d.date).slice(0, 3)}</p>
                    <p className="font-semibold">{formatNumber(d.tMax, 0)}°</p>
                    <p className="text-xs text-muted">{d.frost ? 'gel' : d.rainMm >= 0.5 ? `${formatNumber(d.rainMm, 0)} mm` : d.sprayOk ? 'traitement ok' : '—'}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-muted">
              Indiquez la position de votre exploitation pour voir la météo locale.{' '}
              <Link href="/app/compte#position" className="font-semibold text-brand">Renseigner</Link>
            </p>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Card className="min-w-0 flex-[1_1_520px]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Mes parcelles</h2>
            <p className="text-muted">{parcels.length} parcelle{parcels.length > 1 ? 's' : ''} · {formatNumber(totalHa, 2)} ha</p>
          </div>
          <ul className="divide-y divide-[#eef0eb]">
            {parcels.slice(0, 8).map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-3">
                <span className="font-medium">{p.name}</span>
                <span className="text-muted">{p.crop || '—'} · {formatNumber(Number(p.area_ha), 2)} ha</span>
              </li>
            ))}
          </ul>
          <Link href="/app/parcelles" className="mt-3 inline-block font-semibold text-brand">Gérer les parcelles</Link>
        </Card>

        <Card className="min-w-0 flex-[1_1_340px]">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Dernières interventions</h2>
            <Link href="/app/interventions" className="font-semibold text-brand">Tout voir</Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-muted">Aucune intervention notée pour le moment.</p>
          ) : (
            <ul className="divide-y divide-[#eef0eb]">
              {recent.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold">{INTERVENTION_KINDS[i.kind]}{i.product ? ` · ${i.product}` : ''}</p>
                    <p className="text-sm text-muted">{parcelName.get(i.parcel_id) ?? '—'}{i.dose !== null ? ` · ${formatNumber(Number(i.dose), 3)} ${i.dose_unit}` : ''}</p>
                  </div>
                  <span className="text-sm text-muted">{formatDate(i.done_on, { year: undefined })}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/app/registre" className={`${btn.secondary} mt-4 w-full`}>Imprimer le registre</Link>
        </Card>
      </div>
    </>
  );
}
