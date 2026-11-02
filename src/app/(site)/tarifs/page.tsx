import Link from 'next/link';
import type { Metadata } from 'next';
import { PricingCards } from '@/components/pricing-cards';
import { BUYER_FEE } from '@/lib/bourse-shared';

export const metadata: Metadata = {
  title: 'Tarifs',
  description: 'Gestion de parc gratuite pour démarrer, formule Complet sans engagement. Fiches techniques en accès libre, bourse au matériel sans commission.',
};

const fee = `${(BUYER_FEE.fixed / 100).toFixed(2).replace('.', ',')} € + ${BUYER_FEE.rate * 100} %`;

export default function PricingPage() {
  return (
    <section className="bg-ground">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="mb-3 text-center text-[clamp(32px,4vw,44px)] font-bold tracking-tight">Des tarifs clairs</h1>
        <p className="mb-11 text-center text-muted">Les formules concernent la gestion de parc. Sans engagement : vous arrêtez quand vous voulez.</p>
        <PricingCards />
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-6">
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-brand">S’informer</p>
            <h2 className="mb-2 text-xl font-semibold">Fiches techniques : gratuites</h2>
            <p className="mb-3 text-muted">Toutes les fiches sont en accès libre, sans compte.</p>
            <Link href="/fiches" className="font-semibold text-brand-dark hover:underline">Chercher un modèle →</Link>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-6">
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-brand">Acheter & vendre</p>
            <h2 className="mb-2 text-xl font-semibold">Bourse au matériel : sans commission</h2>
            <p className="mb-3 text-muted">
              Annonces gratuites pour tous les membres, même en formule Gratuit. Avec le paiement sécurisé, l’acheteur paie de petits frais de service ({fee}, 40 € au plus) ; le vendeur reçoit le prix
              affiché.
            </p>
            <Link href="/bourse" className="font-semibold text-brand-dark hover:underline">Voir la bourse →</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
