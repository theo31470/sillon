import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getInterventions, getParcels } from '@/lib/farm-data';
import { formatDate, formatNumber } from '@/lib/format';
import { INTERVENTION_KINDS } from '@/lib/types';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Card, Field, Input, Select, Textarea, btn } from '@/components/ui';
import { createIntervention, deleteIntervention } from './actions';

export const metadata: Metadata = { title: 'Interventions' };

export default async function InterventionsPage(props: PageProps<'/app/interventions'>) {
  await requireUser();
  const { parcelle } = await props.searchParams;
  const parcels = await getParcels();
  const parcelId = typeof parcelle === 'string' && parcels.some((p) => p.id === parcelle) ? parcelle : undefined;
  const interventions = await getInterventions({ limit: 200, parcelId });
  const parcelName = new Map(parcels.map((p) => [p.id, p.name]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Interventions</h1>
          <p className="text-muted">Votre registre : semis, traitements, fertilisation, récoltes.</p>
        </div>
        <Link href="/app/registre" className={btn.secondary}>Imprimer le registre</Link>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Card className="min-w-0 flex-[1_1_340px]">
          <h2 id="nouvelle" className="mb-4 text-xl font-semibold">Noter une intervention</h2>
          {parcels.length === 0 ? (
            <p className="text-muted">Ajoutez d’abord une <Link href="/app/parcelles" className="font-semibold text-brand">parcelle</Link>.</p>
          ) : (
            <ActionForm action={createIntervention}>
              <Field label="Parcelle" htmlFor="parcel_id">
                <Select id="parcel_id" name="parcel_id" required defaultValue={parcelId}>
                  {parcels.map((p) => <option key={p.id} value={p.id}>{p.name}{p.crop ? ` (${p.crop})` : ''}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type" htmlFor="kind">
                  <Select id="kind" name="kind" required>
                    {Object.entries(INTERVENTION_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="Date" htmlFor="done_on">
                  <Input id="done_on" name="done_on" type="date" defaultValue={today} max={today} required />
                </Field>
              </div>
              <Field label="Produit / variété" htmlFor="product">
                <Input id="product" name="product" maxLength={120} placeholder="Ex. : nom commercial du produit" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dose" htmlFor="dose">
                  <Input id="dose" name="dose" inputMode="decimal" placeholder="Ex. : 1,5" />
                </Field>
                <Field label="Unité" htmlFor="dose_unit">
                  <Input id="dose_unit" name="dose_unit" maxLength={20} placeholder="L/ha, kg/ha…" />
                </Field>
              </div>
              <details className="rounded-xl border border-line px-4 py-3">
                <summary className="cursor-pointer font-medium">Plus de détails (cible, opérateur, notes)</summary>
                <div className="mt-4 flex flex-col gap-4">
                  <Field label="Cible du traitement" htmlFor="target">
                    <Input id="target" name="target" maxLength={120} placeholder="Ex. : mildiou, adventices…" />
                  </Field>
                  <Field label="Opérateur" htmlFor="operator">
                    <Input id="operator" name="operator" maxLength={80} />
                  </Field>
                  <Field label="Notes" htmlFor="notes">
                    <Textarea id="notes" name="notes" maxLength={1000} rows={3} />
                  </Field>
                </div>
              </details>
              <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
            </ActionForm>
          )}
        </Card>

        <Card className="min-w-0 flex-[2_1_520px] p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
            <span className="text-sm text-muted">Parcelle :</span>
            <Link href="/app/interventions" className={`rounded-full px-3 py-1.5 text-sm ${!parcelId ? 'bg-brand text-white' : 'border border-field'}`}>Toutes</Link>
            {parcels.map((p) => (
              <Link key={p.id} href={`/app/interventions?parcelle=${p.id}`} className={`rounded-full px-3 py-1.5 text-sm ${parcelId === p.id ? 'bg-brand text-white' : 'border border-field'}`}>
                {p.name}
              </Link>
            ))}
          </div>
          {interventions.length === 0 ? (
            <p className="p-6 text-muted">Aucune intervention.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[15px]">
                <thead>
                  <tr className="text-left text-sm text-muted">
                    <th className="border-b border-line px-4 py-3 font-medium">Date</th>
                    <th className="border-b border-line px-4 py-3 font-medium">Parcelle</th>
                    <th className="border-b border-line px-4 py-3 font-medium">Type</th>
                    <th className="border-b border-line px-4 py-3 font-medium">Produit</th>
                    <th className="border-b border-line px-4 py-3 font-medium">Dose</th>
                    <th className="border-b border-line px-4 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {interventions.map((i) => {
                    const incomplete = i.kind === 'traitement' && (!i.product || i.dose === null);
                    return (
                      <tr key={i.id} className={incomplete ? 'bg-warn-soft' : undefined}>
                        <td className="border-b border-[#eef0eb] px-4 py-3">{formatDate(i.done_on)}</td>
                        <td className="border-b border-[#eef0eb] px-4 py-3 font-medium">{parcelName.get(i.parcel_id) ?? '—'}</td>
                        <td className="border-b border-[#eef0eb] px-4 py-3">{INTERVENTION_KINDS[i.kind]}</td>
                        <td className="border-b border-[#eef0eb] px-4 py-3">{i.product || (incomplete ? <Badge tone="amber">à compléter</Badge> : '—')}</td>
                        <td className="border-b border-[#eef0eb] px-4 py-3">{i.dose !== null ? `${formatNumber(Number(i.dose), 3)} ${i.dose_unit}` : '—'}</td>
                        <td className="border-b border-[#eef0eb] px-4 py-3 text-right">
                          <form action={deleteIntervention}>
                            <input type="hidden" name="id" value={i.id} />
                            <button type="submit" className="text-sm text-danger hover:underline" aria-label={`Supprimer l’intervention du ${formatDate(i.done_on)}`}>Supprimer</button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
