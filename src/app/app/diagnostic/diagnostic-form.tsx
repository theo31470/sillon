'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Field, Select, Textarea } from '@/components/ui';
import { runDiagnosis } from './actions';

export function DiagnosticForm({ machines, disabled }: { machines: { id: string; name: string }[]; disabled: boolean }) {
  const [state, action] = useActionState(runDiagnosis, undefined);
  const r = state?.result;

  return (
    <div className="flex flex-wrap items-start gap-6">
      <form action={action} className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 rounded-2xl border border-line bg-white p-6">
        <Field label="Machine concernée" htmlFor="machine_id">
          <Select id="machine_id" name="machine_id" defaultValue="" disabled={disabled}>
            <option value="">Autre / non listée</option>
            {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <Field label="Qu’est-ce qui ne va pas ?" htmlFor="description" hint="Quand ça arrive, bruits, fumée, voyants allumés, ce que vous avez déjà essayé…">
          <Textarea id="description" name="description" rows={6} required minLength={15} maxLength={2000} disabled={disabled} placeholder="Ex. : le tracteur démarre mal le matin, il faut insister et il fume blanc les premières minutes." />
        </Field>
        {state?.error ? <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{state.error}</p> : null}
        <SubmitButton pendingLabel="Analyse en cours…">Trouver la cause</SubmitButton>
        <p className="text-sm text-muted">Une aide, pas un mécanicien : en cas de doute, faites appel à un professionnel.</p>
      </form>

      <section className="flex min-w-0 flex-[2_1_480px] flex-col gap-4" aria-live="polite">
        {r ? (
          <>
            {r.safety_warning ? (
              <p className="rounded-2xl border border-warn-line bg-warn-soft p-4 font-medium text-warn">⚠ {r.safety_warning}</p>
            ) : null}
            <div className="rounded-2xl border border-line bg-white p-6">
              <p className="mb-4 text-muted">{r.summary}</p>
              <h2 className="mb-3 text-lg font-semibold">Causes probables</h2>
              <ul className="mb-6 flex flex-col gap-3">
                {r.likely_causes.map((c) => (
                  <li key={c.cause} className="rounded-xl bg-ground p-4">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {c.cause}
                      <Badge tone={c.likelihood === 'élevée' ? 'amber' : 'gray'}>probabilité {c.likelihood}</Badge>
                    </p>
                    <p className="text-sm text-muted">{c.why}</p>
                  </li>
                ))}
              </ul>
              <h2 className="mb-3 text-lg font-semibold">À vérifier, dans l’ordre</h2>
              <ol className="mb-6 flex list-decimal flex-col gap-2 pl-5">
                {r.checks.map((c) => (
                  <li key={c.step}>
                    {c.step}
                    {c.safety ? <span className="block text-sm text-warn">Sécurité : {c.safety}</span> : null}
                  </li>
                ))}
              </ol>
              {r.see_mechanic_if.length ? (
                <>
                  <h2 className="mb-2 text-lg font-semibold">Appelez un mécanicien si…</h2>
                  <ul className="list-disc pl-5 text-muted">{r.see_mechanic_if.map((s) => <li key={s}>{s}</li>)}</ul>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-field bg-white p-10 text-center text-muted">
            Le résultat du diagnostic s’affichera ici.
          </div>
        )}
      </section>
    </div>
  );
}
