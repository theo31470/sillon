import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getMachine } from '@/lib/fleet';
import { getBillingDetails } from '@/lib/billing-details';
import { latestValuation } from '@/lib/valuation';
import { priceLabel, type ListingCategory } from '@/lib/bourse-shared';
import type { Machine } from '@/lib/types';
import { ListingForm, type ListingDraft } from '../listing-form';

export const metadata: Metadata = { title: 'Nouvelle annonce · Bourse' };

const CATEGORY_OF_KIND: Record<Machine['kind'], ListingCategory> = {
  tracteur: 'tracteur',
  moissonneuse: 'recolte',
  automoteur: 'recolte',
  telescopique: 'manutention',
  pulverisateur: 'pulverisation',
  outil: 'travail_sol',
  autre: 'autre',
};

export default async function NewListingPage(props: PageProps<'/app/annonces/nouvelle'>) {
  const { session } = await requireUser('/app/annonces/nouvelle');
  const { machine: machineId } = await props.searchParams;
  const [billing, machine] = await Promise.all([
    getBillingDetails(session.userId).catch(() => null),
    typeof machineId === 'string' ? getMachine(machineId) : Promise.resolve(null),
  ]);
  // Mise en vente d'une machine de son propre parc : tout est prérempli.
  const m = machine && machine.role === 'owner' ? machine : null;
  const valuation = m ? await latestValuation(m.id).catch(() => null) : null;
  const draft: ListingDraft = {
    machine_id: m?.id ?? null,
    sheet_id: m?.sheet_id ?? null,
    title: m ? [m.kind === 'tracteur' ? 'Tracteur' : '', m.brand, m.model, m.year ? String(m.year) : ''].filter(Boolean).join(' ').slice(0, 90) : '',
    description: m
      ? [
          m.hours ? `${Math.round(Number(m.hours)).toLocaleString('fr-FR')} heures au compteur.` : '',
          m.logs.length ? `Entretien suivi sur Tracteurs & Co : ${m.logs.length} intervention${m.logs.length > 1 ? 's' : ''} notée${m.logs.length > 1 ? 's' : ''}, la dernière le ${new Date(m.logs[0].done_on).toLocaleDateString('fr-FR')}.` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '',
    category: m ? CATEGORY_OF_KIND[m.kind] : '',
    condition: '',
    price: valuation ? String(Math.round(valuation.mid_cents / 100)) : '',
    negotiable: true,
    brand: m?.brand ?? '',
    model: m?.model ?? '',
    year: m?.year ? String(m.year) : '',
    hours: m?.hours ? String(Math.round(Number(m.hours))) : '',
    postal_code: billing?.country === 'FR' ? billing.postal_code : '',
    city: billing?.country === 'FR' ? billing.city : '',
    delivery: m ? 'main_propre' : 'les_deux',
    weight_kg: '',
    shipping: '',
    parcel_size: '',
    ship_self: false,
    photos: [],
    published: false,
  };
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{m ? `Vendre ${m.name}` : 'Nouvelle annonce'}</h1>
          <p className="text-muted">Gratuit, visible par tous sur la bourse au matériel.</p>
        </div>
        <Link href="/app/annonces" className="font-semibold text-brand-dark hover:underline">← Mes annonces</Link>
      </div>
      <ListingForm draft={draft} estimate={valuation ? { low: priceLabel(valuation.low_cents), high: priceLabel(valuation.high_cents) } : null} />
    </>
  );
}
