import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getParcels } from '@/lib/farm-data';
import { formatNumber } from '@/lib/format';
import { FREE_PARCEL_LIMIT } from '@/lib/plans';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Card, Field, Input, Notice } from '@/components/ui';
import { createParcel, deleteParcel } from './actions';

export const metadata: Metadata = { title: 'Parcelles' };

export default async function ParcelsPage() {
  const { profile } = await requireUser();
  const parcels = await getParcels();
  const total = parcels.reduce((s, p) => s + Number(p.area_ha), 0);
  const atLimit = profile.plan === 'free' && parcels.length >= FREE_PARCEL_LIMIT;

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Parcelles</h1>
        <p className="text-muted">{parcels.length} parcelle{parcels.length > 1 ? 's' : ''} · {formatNumber(total, 2)} ha au total</p>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Card className="min-w-0 flex-[2_1_520px] p-0">
          {parcels.length === 0 ? (
            <p className="p-6 text-muted">Aucune parcelle pour l’instant. Ajoutez la première avec le formulaire.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse">
                <thead>
                  <tr className="bg-[#fafbf9] text-left text-sm text-muted">
                    <th className="border-b border-line px-5 py-3 font-medium">Nom</th>
                    <th className="border-b border-line px-5 py-3 font-medium">Culture</th>
                    <th className="border-b border-line px-5 py-3 font-medium">Surface</th>
                    <th className="border-b border-line px-5 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {parcels.map((p) => (
                    <tr key={p.id}>
                      <td className="border-b border-[#eef0eb] px-5 py-3.5 font-semibold">{p.name}</td>
                      <td className="border-b border-[#eef0eb] px-5 py-3.5">{p.crop || '—'}</td>
                      <td className="border-b border-[#eef0eb] px-5 py-3.5">{formatNumber(Number(p.area_ha), 2)} ha</td>
                      <td className="border-b border-[#eef0eb] px-5 py-3.5 text-right">
                        <form action={deleteParcel}>
                          <input type="hidden" name="id" value={p.id} />
                          <button type="submit" className="text-sm text-danger hover:underline" aria-label={`Supprimer la parcelle ${p.name} et ses interventions`}>
                            Supprimer
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="min-w-0 flex-[1_1_320px]">
          <h2 className="mb-4 text-xl font-semibold">Ajouter une parcelle</h2>
          {atLimit ? (
            <Notice>La formule gratuite permet {FREE_PARCEL_LIMIT} parcelles. <Link href="/app/abonnement" className="font-semibold underline">Passer à la formule Complet</Link></Notice>
          ) : (
            <ActionForm action={createParcel}>
              <Field label="Nom" htmlFor="name">
                <Input id="name" name="name" required maxLength={80} placeholder="Ex. : Les Grès" />
              </Field>
              <Field label="Culture" htmlFor="crop">
                <Input id="crop" name="crop" maxLength={80} placeholder="Ex. : Blé tendre" />
              </Field>
              <Field label="Surface (ha)" htmlFor="area_ha">
                <Input id="area_ha" name="area_ha" inputMode="decimal" required placeholder="Ex. : 4,2" />
              </Field>
              <SubmitButton>Ajouter</SubmitButton>
            </ActionForm>
          )}
          <p className="mt-4 text-sm text-muted">Supprimer une parcelle supprime aussi ses interventions.</p>
        </Card>
      </div>
    </>
  );
}
