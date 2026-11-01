import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getShopProduct } from '@/lib/printful';
import { shopDiscountPercent } from '@/lib/shop-shared';
import { CartLink } from '../shop-bits';
import { ProductPicker } from './product-picker';

export async function generateMetadata(props: PageProps<'/app/boutique/[id]'>): Promise<Metadata> {
  const id = Number((await props.params).id);
  const product = Number.isSafeInteger(id) ? await getShopProduct(id) : null;
  return { title: product ? `${product.name} · Boutique` : 'Boutique' };
}

export default async function ProductPage(props: PageProps<'/app/boutique/[id]'>) {
  const raw = (await props.params).id;
  const { profile } = await requireUser(`/app/boutique/${raw}`);
  const id = Number(raw);
  const product = Number.isSafeInteger(id) ? await getShopProduct(id) : null;
  if (!product) notFound();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/app/boutique" className="font-semibold text-brand-dark hover:underline">← Boutique</Link>
        <CartLink />
      </div>
      <ProductPicker product={product} percent={shopDiscountPercent(profile.plan)} isPaid={profile.plan !== 'free'} />
    </>
  );
}
