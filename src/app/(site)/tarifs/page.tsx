import type { Metadata } from 'next';
import { PricingCards } from '@/components/pricing-cards';

export const metadata: Metadata = { title: 'Tarifs', description: 'Des tarifs clairs et sans engagement.' };

export default function PricingPage() {
  return (
    <section className="bg-ground">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="mb-3 text-center text-[clamp(32px,4vw,44px)] font-bold tracking-tight">Des tarifs clairs</h1>
        <p className="mb-11 text-center text-muted">Sans engagement. Vous arrêtez quand vous voulez.</p>
        <PricingCards />
      </div>
    </section>
  );
}
