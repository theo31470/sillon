import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { SITE } from '@/lib/site';
import { CartView } from './cart-view';

export const metadata: Metadata = { title: 'Panier · Boutique' };

export default async function CartPage() {
  const { profile } = await requireUser('/app/boutique/panier');
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Ma commande</h1>
        <Link href="/app/boutique" className="font-semibold text-brand-dark hover:underline">← Continuer mes achats</Link>
      </div>
      <CartView demo={Boolean(profile.is_demo)} vatMention={SITE.vatMention} defaultName={profile.full_name} />
    </>
  );
}
