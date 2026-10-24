import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getMachine } from '@/lib/fleet';
import { listPublishedSheets } from '@/lib/content';
import { dueLabel } from '@/lib/maintenance';
import { euros } from '@/lib/costs';
import { formatDate, formatNumber } from '@/lib/format';
import { COST_KINDS, MACHINE_KINDS } from '@/lib/types';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Card, Field, Input, Notice, Select, Textarea, btn } from '@/components/ui';
import { DueBar, MachinePicture, STATUS_STYLE } from '@/components/fleet';
import { Icon } from '@/components/sheets/icons';
import { addCost, addTask, deleteCost, deleteLog, deleteMachine, deleteTask, logMaintenance, recordHours, updateMachine } from '../actions';

export async function generateMetadata(props: PageProps<'/app/materiel/[id]'>): Promise<Metadata> {
  const { id } = await props.params;
  const m = await getMachine(id);
  return { title: m?.name ?? 'Machine' };
}

const ORIGIN_SHORT = { constructeur: 'Constructeur', presse: 'Presse', utilisateurs: 'Utilisateurs', general: 'Repère indicatif' } as const;

export default async function MachinePage(props: PageProps<'/app/materiel/[id]'>) {
  const { id } = await props.params;
  const { ajout } = await props.searchParams;
  const { profile } = await requireUser(`/app/materiel/${id}`);
  const m = await getMachine(id);
  if (!m) notFound();
  const paid = profile.plan !== 'free';
  const sheets = await listPublishedSheets({ category: 'machine' });
  const today = new Date().toISOString().slice(0, 10);
  const hoursNow = Number(m.hours);
  const e = m.economics;
  const since = e.windowDays;
  const costTotals = Object.entries(COST_KINDS)
    .map(([k, label]) => ({ k, label, total: k === 'assurance' ? e.fixed.insurance : (e.variable as Record<string, number>)[k] ?? 0 }))
    .filter((c) => c.total > 0);
  const nav = [
    ['entretien', 'Entretien'],
    ['depenses', 'Dépenses'],
    ['cout', 'Coût de revient'],
    ['compteur', 'Compteur'],
    ['infos', 'Informations'],
  ];

  return (
    <>
      <Link href="/app/materiel" transitionTypes={['nav-back']} className="link-underline self-start text-sm text-brand">← Mon parc</Link>
      {ajout ? <Notice tone="green">Machine ajoutée. Complétez ses informations d’achat pour calculer son coût de revient.</Notice> : null}

      {/* En-tête de la machine */}
      <section className="overflow-hidden rounded-3xl border border-line bg-white">
        <div className="grid md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <MachinePicture m={m} className="h-52 md:h-full" />
          <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-brand">{MACHINE_KINDS[m.kind]}</p>
                <h1 className="text-[clamp(26px,3vw,34px)] font-bold leading-tight tracking-tight">{m.name}</h1>
                <p className="text-muted">{[m.brand, m.model, m.year].filter(Boolean).join(' · ') || 'Marque et modèle à compléter'}</p>
                {m.sheet ? (
                  <Link href={`/fiches/${m.sheet.slug}`} className="link-underline mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand">
                    <Icon name="book" size={14} /> Fiche technique : {m.sheet.title}
                  </Link>
                ) : null}
              </div>
              <div className="rounded-2xl bg-admin px-5 py-3 text-white">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#9fb3a4]">Compteur</p>
                <p className="font-mono text-3xl font-bold tabular-nums">{formatNumber(hoursNow, 1)} h</p>
              </div>
            </div>
            <ActionForm action={recordHours} resetOnSuccess={false} className="flex flex-wrap items-end gap-2.5 rounded-xl bg-ground p-3">
              <input type="hidden" name="machine_id" value={m.id} />
              <Field label="Nouveau relevé (h)" htmlFor="hours"><Input id="hours" name="hours" inputMode="decimal" required placeholder={String(hoursNow)} className="w-36" /></Field>
              <Field label="Date" htmlFor="read_on"><Input id="read_on" name="read_on" type="date" defaultValue={today} max={today} className="w-44" /></Field>
              <SubmitButton pendingLabel="…">Relever</SubmitButton>
            </ActionForm>
            <nav aria-label="Sections" className="flex flex-wrap gap-1.5">
              {nav.map(([anchor, label]) => (
                <a key={anchor} href={`#${anchor}`} className="rounded-full border border-field px-3 py-1.5 text-sm font-medium transition-colors hover:border-brand hover:text-brand-dark">{label}</a>
              ))}
              {paid ? (
                <Link href={`/app/materiel/${m.id}/rapport`} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark">
                  <Icon name="print" size={15} /> Rapport pour la revente
                </Link>
              ) : null}
            </nav>
          </div>
        </div>
      </section>

      {/* Entretien */}
      <section id="entretien" className="scroll-mt-6 flex flex-col gap-5">
        <Card>
          <h2 className="mb-1 flex items-center gap-2 text-xl font-semibold"><Icon name="wrench" size={20} className="text-brand" /> Prochains entretiens</h2>
          <p className="mb-4 text-sm text-muted">
            {m.sheet ? 'Plan repris de la fiche technique, complété par vos opérations. ' : 'Ajoutez vos opérations ci-dessous, ou liez la machine à une fiche technique. '}
            Échéance au premier des deux termes atteint (heures ou mois).
          </p>
          {m.due.length === 0 ? (
            <p className="rounded-xl bg-ground p-4 text-muted">Aucune opération avec un intervalle pour le moment.</p>
          ) : (
            <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
              {m.due.map((d) => (
                <li key={d.operation} className={`rounded-xl border border-line p-4 ${d.status !== 'ok' ? STATUS_STYLE[d.status].bg : 'bg-white'}`}>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="font-semibold leading-snug">{d.operation}</p>
                    <Badge tone={d.status === 'retard' ? 'red' : d.status === 'bientot' ? 'amber' : 'green'}>{STATUS_STYLE[d.status].label}</Badge>
                  </div>
                  <DueBar due={d} />
                  <p className={`mt-2 text-sm font-semibold ${STATUS_STYLE[d.status].text}`}>{dueLabel(d)}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Tous les {[d.intervalHours ? `${formatNumber(d.intervalHours, 0)} h` : null, d.intervalMonths ? `${d.intervalMonths} mois` : null].filter(Boolean).join(' ou ')}
                    {' · '}
                    {d.source === 'perso' ? 'votre plan' : `fiche${d.origin && d.origin !== 'constructeur' ? ` (${ORIGIN_SHORT[d.origin].toLowerCase()})` : ''}`}
                    {d.lastDoneOn ? ` · fait le ${formatDate(d.lastDoneOn)} à ${formatNumber(d.lastDoneHours ?? 0, 0)} h` : ' · jamais noté'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-wrap items-start gap-5">
          <Card className="min-w-0 flex-[1_1_360px]">
            <h3 className="mb-3 text-lg font-semibold">Noter un entretien</h3>
            <ActionForm action={logMaintenance}>
              <input type="hidden" name="machine_id" value={m.id} />
              <Field label="Opération" htmlFor="operation">
                <Select id="operation" name="operation" defaultValue={m.due[0]?.operation ?? ''}>
                  {m.due.map((d) => <option key={d.operation}>{d.operation}</option>)}
                  <option value="">Autre (préciser ci-dessous)</option>
                </Select>
              </Field>
              <Input aria-label="Autre opération" name="operation_custom" maxLength={160} placeholder="Autre opération : ex. changement courroie" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Au compteur (h)" htmlFor="done_at_hours"><Input id="done_at_hours" name="done_at_hours" inputMode="decimal" defaultValue={String(hoursNow)} required /></Field>
                <Field label="Date" htmlFor="done_on"><Input id="done_on" name="done_on" type="date" defaultValue={today} max={today} /></Field>
              </div>
              <Field label="Coût (€ HT, facultatif)" htmlFor="cost" hint="Ajouté aux dépenses de la machine.">
                <Input id="cost" name="cost" inputMode="decimal" />
              </Field>
              <Field label="Notes" htmlFor="notes"><Textarea id="notes" name="notes" rows={2} maxLength={1000} placeholder="Pièces changées, garage…" /></Field>
              <SubmitButton pendingLabel="Enregistrement…">Noter l’entretien</SubmitButton>
            </ActionForm>
          </Card>

          <Card className="min-w-0 flex-[1_1_320px]">
            <h3 className="mb-1 text-lg font-semibold">Mon plan d’entretien</h3>
            <p className="mb-3 text-sm text-muted">Vos propres opérations. Une opération du même nom remplace celle de la fiche.</p>
            {m.tasks.length ? (
              <ul className="mb-4 divide-y divide-[#eef0eb] text-sm">
                {m.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                    <span><strong>{t.operation}</strong> · tous les {[t.interval_hours ? `${formatNumber(Number(t.interval_hours), 0)} h` : null, t.interval_months ? `${t.interval_months} mois` : null].filter(Boolean).join(' ou ')}</span>
                    <form action={deleteTask}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="machine_id" value={m.id} />
                      <button type="submit" className="text-danger hover:underline" aria-label={`Retirer ${t.operation}`}>Retirer</button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}
            <ActionForm action={addTask} className="flex flex-col gap-3">
              <input type="hidden" name="machine_id" value={m.id} />
              <Field label="Opération" htmlFor="task-op"><Input id="task-op" name="operation" required maxLength={160} placeholder="Ex. : graissage" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Toutes les (h)" htmlFor="interval_hours"><Input id="interval_hours" name="interval_hours" inputMode="decimal" placeholder="50" /></Field>
                <Field label="ou tous les (mois)" htmlFor="interval_months"><Input id="interval_months" name="interval_months" inputMode="numeric" placeholder="12" /></Field>
              </div>
              <SubmitButton variant="secondary" pendingLabel="…">Ajouter au plan</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        {m.logs.length ? (
          <Card>
            <h3 className="mb-2 text-lg font-semibold">Historique des entretiens ({m.logs.length})</h3>
            <ul className="divide-y divide-[#eef0eb] text-sm">
              {m.logs.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <span className="w-24 flex-none text-muted">{formatDate(l.done_on)}</span>
                  <span className="w-20 flex-none font-mono tabular-nums">{formatNumber(Number(l.done_at_hours), 0)} h</span>
                  <span className="min-w-0 flex-1 font-medium">{l.operation}{l.notes ? <span className="font-normal text-muted"> · {l.notes}</span> : null}</span>
                  <form action={deleteLog}>
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="machine_id" value={m.id} />
                    <button type="submit" className="text-xs text-danger hover:underline">Supprimer</button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </section>

      {/* Dépenses */}
      <section id="depenses" className="scroll-mt-6 flex flex-wrap items-start gap-5">
        <Card className="min-w-0 flex-[1_1_340px]">
          <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold"><Icon name="can" size={20} className="text-brand" /> Ajouter une dépense</h2>
          <ActionForm action={addCost}>
            <input type="hidden" name="machine_id" value={m.id} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type" htmlFor="kind">
                <Select id="kind" name="kind" defaultValue="carburant">
                  {Object.entries(COST_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Montant (€ HT)" htmlFor="amount"><Input id="amount" name="amount" inputMode="decimal" required /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Litres (carburant)" htmlFor="liters"><Input id="liters" name="liters" inputMode="decimal" /></Field>
              <Field label="Date" htmlFor="spent_on"><Input id="spent_on" name="spent_on" type="date" defaultValue={today} max={today} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Libellé" htmlFor="label"><Input id="label" name="label" maxLength={160} placeholder="Ex. : 2 pneus AR" /></Field>
              <Field label="Compteur (h)" htmlFor="hours_at"><Input id="hours_at" name="hours_at" inputMode="decimal" placeholder={String(hoursNow)} /></Field>
            </div>
            <SubmitButton pendingLabel="Enregistrement…">Enregistrer la dépense</SubmitButton>
          </ActionForm>
        </Card>

        <Card className="min-w-0 flex-[2_1_480px]">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">Dépenses</h2>
            <p className="text-sm text-muted">12 derniers mois : <strong className="text-ink">{euros(e.variable.total + e.fixed.insurance)}</strong> HT</p>
          </div>
          {costTotals.length ? (
            <ul className="mb-4 flex flex-wrap gap-2">
              {costTotals.map((c) => <li key={c.k}><Badge tone="gray">{c.label} · {euros(c.total)}</Badge></li>)}
            </ul>
          ) : null}
          {m.costs.length === 0 ? (
            <p className="text-muted">Aucune dépense enregistrée.</p>
          ) : (
            <ul className="divide-y divide-[#eef0eb] text-sm">
              {m.costs.slice(0, 40).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <span className="w-24 flex-none text-muted">{formatDate(c.spent_on)}</span>
                  <span className="min-w-0 flex-1"><strong>{COST_KINDS[c.kind]}</strong>{c.label ? ` · ${c.label}` : ''}{c.liters ? <span className="text-muted"> · {formatNumber(Number(c.liters), 0)} L</span> : null}</span>
                  <span className="font-semibold tabular-nums">{euros(Number(c.amount), 2)}</span>
                  <form action={deleteCost}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="machine_id" value={m.id} />
                    <button type="submit" className="text-xs text-danger hover:underline">Supprimer</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Coût de revient */}
      <section id="cout" className="scroll-mt-6">
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-6">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold"><Icon name="power" size={20} className="text-brand" /> Coût de revient à l’heure</h2>
              <p className="text-sm text-muted">Charges fixes (amortissement, frais financiers, assurance) + charges variables des {since} derniers jours, en € HT.</p>
            </div>
            {paid && e.perHour ? (
              <div className="text-right">
                <p className="text-4xl font-bold tabular-nums text-brand-dark">{euros(e.perHour.total, 2)}</p>
                <p className="text-sm text-muted">par heure de travail</p>
              </div>
            ) : null}
          </div>
          {!paid ? (
            <div className="flex flex-wrap items-center justify-between gap-4 bg-brand-tint p-6">
              <p className="max-w-xl">Le coût de revient machine par machine (et la marge si vous facturez à l’heure) est inclus dans la formule Complet.</p>
              <Link href="/app/abonnement" className={btn.primary}>Découvrir la formule Complet</Link>
            </div>
          ) : (
            <div className="grid gap-6 p-6 md:grid-cols-2">
              <div>
                <h3 className="mb-3 font-semibold">Détail sur un an</h3>
                <dl className="text-sm">
                  {[
                    ['Amortissement', e.fixed.depreciation, e.fixed.fullyDepreciated ? 'machine amortie' : m.purchase_price !== null ? `${euros(Number(m.purchase_price))} − ${euros(Number(m.resale_value ?? 0))} sur ${m.depreciation_years} ans` : 'prix d’achat à renseigner'],
                    ['Frais financiers', e.fixed.interest, `${formatNumber(Number(m.interest_rate), 2)} % du capital moyen`],
                    ['Assurance', e.fixed.insurance, '12 derniers mois'],
                    ['Carburant', e.variable.carburant, e.fuelLitersPerHour ? `${formatNumber(e.fuelLitersPerHour, 1)} L/h` : ''],
                    ['Entretien', e.variable.entretien, ''],
                    ['Réparations', e.variable.reparation, ''],
                    ['Pneumatiques', e.variable.pneumatiques, ''],
                    ['Autres', e.variable.autre, ''],
                  ].map(([label, value, hint]) => (
                    <div key={label as string} className="flex items-baseline justify-between gap-3 border-b border-[#f0f2ee] py-2">
                      <dt>{label}{hint ? <span className="block text-xs text-muted">{hint}</span> : null}</dt>
                      <dd className="font-semibold tabular-nums">{euros(value as number)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="flex flex-col gap-4">
                <div className="rounded-xl bg-ground p-4 text-sm">
                  <p className="text-muted">Heures de travail retenues</p>
                  <p className="text-2xl font-bold tabular-nums">{e.annualHours ? `${formatNumber(e.annualHours, 0)} h / an` : '—'}</p>
                  <p className="text-muted">{e.hoursSource === 'releves' ? 'd’après vos relevés de compteur' : e.hoursSource === 'estimation' ? 'd’après votre estimation (pas encore assez de relevés)' : 'relevez le compteur régulièrement, ou indiquez une estimation'}</p>
                </div>
                {e.perHour ? (
                  <div className="flex flex-col gap-2">
                    {[
                      ['Charges fixes', e.perHour.fixed, 'bg-soil'],
                      ['Charges variables', e.perHour.variable, 'bg-wheat'],
                    ].map(([label, value, color]) => (
                      <div key={label as string}>
                        <div className="mb-1 flex justify-between text-sm"><span>{label}</span><strong className="tabular-nums">{euros(value as number, 2)} / h</strong></div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-[#eef0eb]">
                          <div className={`h-full rounded-full ${color}`} style={{ width: `${e.perHour!.total > 0 ? ((value as number) / e.perHour!.total) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {e.billingMargin !== null ? (
                  <p className={`rounded-xl p-4 text-sm font-semibold ${e.billingMargin >= 0 ? 'bg-brand-tint text-brand-dark' : 'bg-danger-soft text-danger'}`}>
                    Tarif facturé {euros(Number(m.billing_rate), 2)} / h : marge de {euros(e.billingMargin, 2)} / h
                  </p>
                ) : null}
                {e.missing.length ? (
                  <Notice tone="amber">Pour un calcul complet, renseignez : {e.missing.join(', ')} (rubrique Informations).</Notice>
                ) : null}
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* Compteur */}
      <section id="compteur" className="scroll-mt-6">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold"><Icon name="clock" size={20} className="text-brand" /> Relevés de compteur</h2>
          {m.readings.length === 0 ? (
            <p className="text-muted">Aucun relevé.</p>
          ) : (
            <ul className="grid gap-2 text-sm [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
              {m.readings.slice(0, 24).map((r) => (
                <li key={r.id} className="flex justify-between rounded-lg bg-ground px-3 py-2">
                  <span className="text-muted">{formatDate(r.read_on)}</span>
                  <strong className="font-mono tabular-nums">{formatNumber(Number(r.hours), 1)} h</strong>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Informations */}
      <section id="infos" className="scroll-mt-6 flex flex-wrap items-start gap-5">
        <Card className="min-w-0 flex-[2_1_520px]">
          <h2 className="mb-4 text-xl font-semibold">Informations</h2>
          <ActionForm action={updateMachine} resetOnSuccess={false}>
            <input type="hidden" name="id" value={m.id} />
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              <Field label="Nom" htmlFor="i-name"><Input id="i-name" name="name" defaultValue={m.name} required maxLength={80} /></Field>
              <Field label="Type" htmlFor="i-kind">
                <Select id="i-kind" name="kind" defaultValue={m.kind}>
                  {Object.entries(MACHINE_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Fiche technique" htmlFor="i-sheet">
                <Select id="i-sheet" name="sheet_id" defaultValue={m.sheet_id ?? ''}>
                  <option value="">Aucune</option>
                  {sheets.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </Select>
              </Field>
              <Field label="Marque" htmlFor="i-brand"><Input id="i-brand" name="brand" defaultValue={m.brand} maxLength={60} /></Field>
              <Field label="Modèle" htmlFor="i-model"><Input id="i-model" name="model" defaultValue={m.model} maxLength={80} /></Field>
              <Field label="Année" htmlFor="i-year"><Input id="i-year" name="year" inputMode="numeric" defaultValue={m.year ?? ''} maxLength={4} /></Field>
              <Field label="N° de série" htmlFor="i-serial"><Input id="i-serial" name="serial_number" defaultValue={m.serial_number} maxLength={60} /></Field>
              <Field label="Immatriculation" htmlFor="i-reg"><Input id="i-reg" name="registration" defaultValue={m.registration} maxLength={20} /></Field>
            </div>
            <fieldset className="mt-2 grid gap-3 rounded-xl bg-ground p-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
              <legend className="mb-1 font-semibold">Données pour le coût de revient (€ HT)</legend>
              <Field label="Date d’achat" htmlFor="i-pdate"><Input id="i-pdate" name="purchase_date" type="date" defaultValue={m.purchase_date ?? ''} max={today} /></Field>
              <Field label="Prix d’achat" htmlFor="i-price"><Input id="i-price" name="purchase_price" inputMode="decimal" defaultValue={m.purchase_price ?? ''} /></Field>
              <Field label="Valeur de revente estimée" htmlFor="i-resale"><Input id="i-resale" name="resale_value" inputMode="decimal" defaultValue={m.resale_value ?? ''} /></Field>
              <Field label="Durée d’amortissement (ans)" htmlFor="i-years"><Input id="i-years" name="depreciation_years" inputMode="numeric" defaultValue={m.depreciation_years} required /></Field>
              <Field label="Taux d’emprunt (%)" htmlFor="i-rate"><Input id="i-rate" name="interest_rate" inputMode="decimal" defaultValue={Number(m.interest_rate) || ''} placeholder="0" /></Field>
              <Field label="Heures par an (estimation)" htmlFor="i-hours" hint="Utilisée tant qu’il n’y a pas 2 mois de relevés."><Input id="i-hours" name="annual_hours_estimate" inputMode="numeric" defaultValue={m.annual_hours_estimate ?? ''} /></Field>
              <Field label="Tarif facturé (€/h)" htmlFor="i-billing" hint="CUMA, ETA, entraide : pour voir la marge."><Input id="i-billing" name="billing_rate" inputMode="decimal" defaultValue={m.billing_rate ?? ''} /></Field>
            </fieldset>
            <Field label="Notes" htmlFor="i-notes"><Textarea id="i-notes" name="notes" defaultValue={m.notes} rows={3} maxLength={2000} /></Field>
            <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
          </ActionForm>
        </Card>
        <Card className="min-w-0 flex-[1_1_280px] border-[#e3b7b0]">
          <h2 className="mb-2 text-lg font-semibold text-danger">Retirer du parc</h2>
          <p className="mb-3 text-sm text-muted">Supprime la machine et tout son historique (entretiens, relevés, dépenses). Pensez à imprimer le rapport avant une vente.</p>
          <ActionForm action={deleteMachine}>
            <input type="hidden" name="id" value={m.id} />
            <Field label="Tapez SUPPRIMER pour confirmer" htmlFor="confirm"><Input id="confirm" name="confirm" autoComplete="off" required /></Field>
            <SubmitButton variant="danger" pendingLabel="Suppression…">Supprimer la machine</SubmitButton>
          </ActionForm>
        </Card>
      </section>
    </>
  );
}
