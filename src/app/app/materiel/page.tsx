import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getFleet } from '@/lib/fleet';
import { listPublishedSheets } from '@/lib/content';
import { FREE_MACHINE_LIMIT } from '@/lib/plans';
import { MACHINE_KINDS } from '@/lib/types';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Card, Field, Input, Select, btn } from '@/components/ui';
import { MachineCard } from '@/components/fleet';
import { addMachine } from './actions';

export const metadata: Metadata = { title: 'Mon parc' };

export default async function FleetPage() {
  const { profile } = await requireUser('/app/materiel');
  const [fleet, sheets] = await Promise.all([getFleet(), listPublishedSheets({ category: 'machine' })]);
  const free = profile.plan === 'free';
  const full = free && fleet.length >= FREE_MACHINE_LIMIT;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mon parc</h1>
          <p className="text-muted">Compteurs, entretiens, dépenses et coût de revient de chaque machine.</p>
        </div>
        {free ? (
          <p className="text-sm text-muted">
            {fleet.length} / {FREE_MACHINE_LIMIT} machines (formule gratuite) ·{' '}
            <Link href="/app/abonnement" className="font-semibold text-brand">Parc illimité</Link>
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[2_1_560px]">
          {fleet.length === 0 ? (
            <Card><p className="text-muted">Aucune machine pour le moment : ajoutez la première avec le formulaire.</p></Card>
          ) : (
            <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
              {fleet.map((m) => <MachineCard key={m.id} m={m} />)}
            </div>
          )}
        </div>

        <Card className="min-w-0 flex-[1_1_300px] lg:sticky lg:top-6">
          <h2 id="ajouter" className="mb-1 scroll-mt-24 text-xl font-semibold">Ajouter une machine</h2>
          <p className="mb-4 text-sm text-muted">Le reste (achat, n° de série…) se complète ensuite.</p>
          {full ? (
            <div className="flex flex-col gap-3">
              <p className="text-muted">Vous avez atteint les {FREE_MACHINE_LIMIT} machines de la formule gratuite.</p>
              <Link href="/app/abonnement" className={btn.primary}>Passer à la formule Complet</Link>
            </div>
          ) : (
            <ActionForm action={addMachine}>
              <Field label="Nom" htmlFor="name" hint="Comme vous l’appelez : « le gros vert », « télesco »…">
                <Input id="name" name="name" required maxLength={80} />
              </Field>
              <Field label="Modèle (fiche technique)" htmlFor="sheet_id" hint="Pour reprendre automatiquement le plan d’entretien.">
                <Select id="sheet_id" name="sheet_id" defaultValue="">
                  <option value="">Pas de fiche / modèle absent</option>
                  {sheets.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </Select>
              </Field>
              <Field label="Type" htmlFor="kind">
                <Select id="kind" name="kind" defaultValue="tracteur">
                  {Object.entries(MACHINE_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Marque" htmlFor="brand"><Input id="brand" name="brand" maxLength={60} /></Field>
                <Field label="Modèle" htmlFor="model"><Input id="model" name="model" maxLength={80} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Année" htmlFor="year"><Input id="year" name="year" inputMode="numeric" maxLength={4} placeholder="2018" /></Field>
                <Field label="Compteur (h)" htmlFor="hours"><Input id="hours" name="hours" inputMode="decimal" defaultValue="0" required /></Field>
              </div>
              <SubmitButton pendingLabel="Ajout…">Ajouter au parc</SubmitButton>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
