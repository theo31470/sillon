import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getMachine } from '@/lib/fleet';
import { euros } from '@/lib/costs';
import { formatDate, formatNumber } from '@/lib/format';
import { COST_KINDS, MACHINE_KINDS } from '@/lib/types';
import { PrintButton } from '@/components/print-button';
import { Logo } from '@/components/ui';

export const metadata: Metadata = { title: 'Rapport d’historique', robots: { index: false } };

/**
 * Rapport d'historique imprimable (PDF) pour une vente : identité de la machine,
 * entretiens, relevés de compteur et, sur demande, dépenses.
 */
export default async function ReportPage(props: PageProps<'/app/materiel/[id]/rapport'>) {
  const { id } = await props.params;
  const { couts } = await props.searchParams;
  const { profile } = await requireUser(`/app/materiel/${id}/rapport`);
  if (profile.plan === 'free') redirect('/app/abonnement?raison=rapport');
  const m = await getMachine(id);
  if (!m) notFound();
  const withCosts = couts === '1';
  const logs = [...m.logs].sort((a, b) => a.done_on.localeCompare(b.done_on) || Number(a.done_at_hours) - Number(b.done_at_hours));
  const readings = [...m.readings].sort((a, b) => a.read_on.localeCompare(b.read_on));
  const byYear = new Map<string, Record<string, number>>();
  for (const c of m.costs) {
    const y = c.spent_on.slice(0, 4);
    const row = byYear.get(y) ?? {};
    row[c.kind] = (row[c.kind] ?? 0) + Number(c.amount);
    byYear.set(y, row);
  }
  const identity = [
    ['Type', MACHINE_KINDS[m.kind]],
    ['Marque / modèle', [m.brand, m.model].filter(Boolean).join(' ') || '—'],
    ['Année', m.year ? String(m.year) : '—'],
    ['N° de série', m.serial_number || '—'],
    ['Immatriculation', m.registration || '—'],
    ['Compteur', `${formatNumber(Number(m.hours), 1)} h`],
  ];

  return (
    <>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/app/materiel/${m.id}`} className="text-sm text-brand">← Retour à la machine</Link>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/app/materiel/${m.id}/rapport${withCosts ? '' : '?couts=1'}`} className="text-sm font-semibold text-brand">
            {withCosts ? 'Masquer les dépenses' : 'Inclure les dépenses'}
          </Link>
          <PrintButton />
        </div>
      </div>

      <article className="mx-auto w-full max-w-3xl rounded-2xl border border-line bg-surface p-5 sm:p-8 print:border-0 print:p-0">
        <header className="mb-6 flex items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-brand">Historique d’entretien</p>
            <h1 className="text-[28px] font-bold tracking-tight sm:text-3xl">{m.name}</h1>
            <p className="text-muted">{profile.farm_name || profile.full_name} · établi le {formatDate(new Date())}</p>
          </div>
          <Logo />
        </header>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Identification</h2>
          <dl className="grid grid-cols-2 gap-x-6 text-sm sm:grid-cols-3">
            {identity.map(([k, v]) => (
              <div key={k} className="border-b border-line-soft py-2">
                <dt className="text-muted">{k}</dt>
                <dd className="font-semibold [overflow-wrap:anywhere]">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Entretiens réalisés ({logs.length})</h2>
          {logs.length === 0 ? (
            <p className="text-sm text-muted">Aucun entretien enregistré.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="border-b border-line py-2 pr-3 font-medium">Date</th>
                  <th className="border-b border-line py-2 pr-3 font-medium">Compteur</th>
                  <th className="border-b border-line py-2 font-medium">Opération</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="border-b border-line-soft py-2 pr-3 whitespace-nowrap">{formatDate(l.done_on)}</td>
                    <td className="border-b border-line-soft py-2 pr-3 whitespace-nowrap tabular-nums">{formatNumber(Number(l.done_at_hours), 0)} h</td>
                    <td className="border-b border-line-soft py-2">{l.operation}{l.notes ? <span className="text-muted"> · {l.notes}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Relevés de compteur</h2>
          {readings.length < 2 ? (
            <p className="text-sm text-muted">Pas assez de relevés.</p>
          ) : (
            <p className="text-sm">
              {readings.length} relevés du {formatDate(readings[0].read_on)} ({formatNumber(Number(readings[0].hours), 0)} h) au{' '}
              {formatDate(readings.at(-1)!.read_on)} ({formatNumber(Number(readings.at(-1)!.hours), 0)} h).
            </p>
          )}
        </section>

        {withCosts && byYear.size ? (
          <section className="mb-6">
            <h2 className="mb-2 text-lg font-semibold">Dépenses par année (€ HT)</h2>
            <div className="scroll-x -mx-1 px-1">
            <table className="w-full min-w-[560px] border-collapse text-sm print:min-w-0">
              <thead>
                <tr className="text-left text-muted">
                  <th className="border-b border-line py-2 pr-3 font-medium">Année</th>
                  {Object.values(COST_KINDS).map((l) => <th key={l} className="border-b border-line py-2 pr-3 text-right font-medium">{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...byYear].sort(([a], [b]) => b.localeCompare(a)).map(([year, row]) => (
                  <tr key={year}>
                    <td className="border-b border-line-soft py-2 pr-3">{year}</td>
                    {Object.keys(COST_KINDS).map((k) => <td key={k} className="border-b border-line-soft py-2 pr-3 text-right tabular-nums">{row[k] ? euros(row[k]) : '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </section>
        ) : null}

        <footer className="border-t border-line pt-4 text-xs text-muted">
          Document établi par le propriétaire à partir de ses saisies dans Tracteurs & Co. Il ne remplace pas les factures d’entretien, à conserver et à présenter à l’acheteur.
        </footer>
      </article>
    </>
  );
}
