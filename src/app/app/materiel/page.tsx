import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getMachinesWithMaintenance } from '@/lib/farm-data';
import { listPublishedSheets } from '@/lib/content';
import { formatDate, formatNumber } from '@/lib/format';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Card, Field, Input, Notice, Select, btn } from '@/components/ui';
import { addMachine, deleteMachine, logMaintenance, updateHours } from './actions';

export const metadata: Metadata = { title: 'Matériel' };

export default async function MachinesPage(props: PageProps<'/app/materiel'>) {
  const { profile } = await requireUser();
  const { ajout } = await props.searchParams;
  const [machines, sheets] = await Promise.all([getMachinesWithMaintenance(), listPublishedSheets({ category: 'machine' })]);
  const paid = profile.plan !== 'free';

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Matériel</h1>
        <p className="text-muted">Compteurs d’heures et rappels d’entretien, calculés à partir des fiches techniques.</p>
      </div>
      {ajout ? <Notice tone="green">Machine ajoutée à votre parc.</Notice> : null}
      {!paid ? (
        <Card className="flex flex-wrap items-center justify-between gap-4 bg-brand-tint">
          <p className="font-medium">Le suivi du matériel et les rappels d’entretien sont inclus dans la formule Complet.</p>
          <Link href="/app/abonnement" className={btn.primary}>Voir la formule Complet</Link>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-5">
          {machines.length === 0 ? (
            <Card><p className="text-muted">Aucune machine pour le moment.</p></Card>
          ) : (
            machines.map((m) => {
              const next = m.due[0];
              return (
                <Card key={m.id}>
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">{m.name}</h2>
                      {m.sheet ? (
                        <Link href={`/fiches/${m.sheet.slug}`} className="text-sm text-brand">Fiche : {m.sheet.title}</Link>
                      ) : (
                        <p className="text-sm text-muted">Sans fiche technique liée : pas de rappels automatiques.</p>
                      )}
                    </div>
                    <p className="text-lg"><span className="text-muted">Compteur</span> <strong>{formatNumber(Number(m.hours))} h</strong></p>
                  </div>

                  {next ? (
                    <div className="mb-4">
                      <div className="mb-1.5 flex justify-between text-sm">
                        <span>Prochain : {next.operation}</span>
                        <strong className={next.remainingHours <= 25 ? 'text-warn' : ''}>
                          {next.remainingHours <= 0 ? `en retard de ${formatNumber(-next.remainingHours)} h` : `dans ${formatNumber(next.remainingHours)} h`}
                        </strong>
                      </div>
                      <div className="h-2 rounded bg-[#eef0eb]">
                        <div
                          className={`h-2 rounded ${next.remainingHours <= 25 ? 'bg-[#d99a2b]' : 'bg-brand'}`}
                          style={{ width: `${Math.min(100, Math.max(4, 100 - (next.remainingHours / next.intervalHours) * 100))}%` }}
                        />
                      </div>
                      {m.due.length > 1 ? (
                        <ul className="mt-3 flex flex-wrap gap-2">
                          {m.due.slice(1, 5).map((d) => (
                            <li key={d.operation}><Badge tone={d.remainingHours <= 25 ? 'amber' : 'gray'}>{d.operation} · {formatNumber(d.remainingHours)} h</Badge></li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                    <ActionForm action={updateHours} className="flex flex-col gap-2 rounded-xl bg-ground p-4" resetOnSuccess={false}>
                      <input type="hidden" name="id" value={m.id} />
                      <Field label="Mettre à jour le compteur (h)" htmlFor={`hours-${m.id}`}>
                        <Input id={`hours-${m.id}`} name="hours" inputMode="decimal" defaultValue={String(m.hours)} required />
                      </Field>
                      <SubmitButton variant="secondary">Enregistrer</SubmitButton>
                    </ActionForm>
                    <ActionForm action={logMaintenance} className="flex flex-col gap-2 rounded-xl bg-ground p-4">
                      <input type="hidden" name="machine_id" value={m.id} />
                      <Field label="Noter un entretien" htmlFor={`op-${m.id}`}>
                        {m.due.length ? (
                          <Select id={`op-${m.id}`} name="operation" required>
                            {m.due.map((d) => <option key={d.operation}>{d.operation}</option>)}
                          </Select>
                        ) : (
                          <Input id={`op-${m.id}`} name="operation" required maxLength={160} placeholder="Ex. : vidange moteur" />
                        )}
                      </Field>
                      <Input aria-label="Fait à (heures)" name="done_at_hours" inputMode="decimal" defaultValue={String(m.hours)} required />
                      <SubmitButton variant="secondary">Noter</SubmitButton>
                    </ActionForm>
                  </div>

                  {m.logs.length ? (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm font-medium text-muted">Historique ({m.logs.length})</summary>
                      <ul className="mt-2 text-sm">
                        {m.logs.slice(0, 10).map((l) => (
                          <li key={l.id} className="flex justify-between border-b border-[#eef0eb] py-2">
                            <span>{l.operation}</span>
                            <span className="text-muted">{formatNumber(Number(l.done_at_hours))} h · {formatDate(l.done_on)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}

                  <form action={deleteMachine} className="mt-4 text-right">
                    <input type="hidden" name="id" value={m.id} />
                    <button type="submit" className="text-sm text-danger hover:underline">Retirer cette machine</button>
                  </form>
                </Card>
              );
            })
          )}
        </div>

        <Card className="min-w-0 flex-[1_1_300px]">
          <h2 className="mb-4 text-xl font-semibold">Ajouter une machine</h2>
          <ActionForm action={addMachine}>
            <Field label="Nom" htmlFor="name" hint="Comme vous l’appelez : « le petit vert »…">
              <Input id="name" name="name" required maxLength={80} disabled={!paid} />
            </Field>
            <Field label="Fiche technique (pour les rappels)" htmlFor="sheet_id">
              <Select id="sheet_id" name="sheet_id" disabled={!paid} defaultValue="">
                <option value="">Aucune</option>
                {sheets.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </Select>
            </Field>
            <Field label="Compteur actuel (h)" htmlFor="hours">
              <Input id="hours" name="hours" inputMode="decimal" defaultValue="0" disabled={!paid} />
            </Field>
            <SubmitButton>{paid ? 'Ajouter' : 'Formule Complet requise'}</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
