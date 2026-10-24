import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getInterventions, getParcels } from '@/lib/farm-data';
import { formatDate, formatNumber } from '@/lib/format';
import { INTERVENTION_KINDS } from '@/lib/types';
import { PrintButton } from '@/components/print-button';
import { Notice } from '@/components/ui';

export const metadata: Metadata = { title: 'Registre des interventions' };

export default async function RegisterPage(props: PageProps<'/app/registre'>) {
  const { profile } = await requireUser();
  const { annee, type } = await props.searchParams;
  const currentYear = new Date().getFullYear();
  const year = typeof annee === 'string' && /^\d{4}$/.test(annee) ? Number(annee) : currentYear;
  const onlyTreatments = type === 'phyto';

  const [parcels, all] = await Promise.all([
    getParcels(),
    getInterventions({ from: `${year}-01-01`, to: `${year}-12-31` }),
  ]);
  const rows = (onlyTreatments ? all.filter((i) => i.kind === 'traitement') : all).slice().reverse();
  const parcelById = new Map(parcels.map((p) => [p.id, p]));
  const incomplete = rows.filter((i) => i.kind === 'traitement' && (!i.product || i.dose === null)).length;

  return (
    <div className="rounded-2xl border border-line bg-white p-8 print:border-0 print:p-0">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
            <Link key={y} href={`/app/registre?annee=${y}${onlyTreatments ? '&type=phyto' : ''}`} className={`rounded-full px-3.5 py-1.5 ${y === year ? 'bg-brand text-white' : 'border border-field'}`}>{y}</Link>
          ))}
          <Link href={`/app/registre?annee=${year}${onlyTreatments ? '' : '&type=phyto'}`} className="rounded-full border border-field px-3.5 py-1.5">
            {onlyTreatments ? 'Toutes les interventions' : 'Traitements uniquement'}
          </Link>
        </div>
        <PrintButton />
      </div>

      {incomplete > 0 ? (
        <div className="no-print mb-6">
          <Notice>{incomplete} traitement{incomplete > 1 ? 's' : ''} sans produit ou sans dose : complétez-les avant un contrôle.</Notice>
        </div>
      ) : null}

      <header className="mb-6">
        <h1 className="text-2xl font-bold">{onlyTreatments ? 'Registre des traitements phytosanitaires' : 'Registre des interventions'} — {year}</h1>
        <p className="text-muted">{profile.farm_name || profile.full_name} · édité le {formatDate(new Date(), { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </header>

      {rows.length === 0 ? (
        <p className="text-muted">Aucune intervention enregistrée sur cette période.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left">
              {['Date', 'Parcelle', 'Culture', 'Surface', 'Intervention', 'Produit', 'Dose', 'Cible', 'Opérateur'].map((h) => (
                <th key={h} className="border border-[#c9cfc6] bg-ground px-2 py-1.5 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const p = parcelById.get(i.parcel_id);
              return (
                <tr key={i.id}>
                  <td className="border border-[#c9cfc6] px-2 py-1.5">{formatDate(i.done_on, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                  <td className="border border-[#c9cfc6] px-2 py-1.5">{p?.name ?? '—'}</td>
                  <td className="border border-[#c9cfc6] px-2 py-1.5">{p?.crop || '—'}</td>
                  <td className="border border-[#c9cfc6] px-2 py-1.5">{p ? `${formatNumber(Number(p.area_ha), 2)} ha` : '—'}</td>
                  <td className="border border-[#c9cfc6] px-2 py-1.5">{INTERVENTION_KINDS[i.kind]}</td>
                  <td className="border border-[#c9cfc6] px-2 py-1.5">{i.product || '—'}</td>
                  <td className="border border-[#c9cfc6] px-2 py-1.5">{i.dose !== null ? `${formatNumber(Number(i.dose), 3)} ${i.dose_unit}` : '—'}</td>
                  <td className="border border-[#c9cfc6] px-2 py-1.5">{i.target || '—'}</td>
                  <td className="border border-[#c9cfc6] px-2 py-1.5">{i.operator || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="mt-6 text-xs text-muted">
        Document généré par Sillon à partir des saisies de l’exploitant. Vérifiez auprès de votre conseiller les mentions exigées pour votre situation.
      </p>
    </div>
  );
}
