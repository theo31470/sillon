import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getShopCatalog, printfulConfigured } from '@/lib/printful';
import { SHOP_MEMBER_DISCOUNT, shopDiscountPercent } from '@/lib/shop-shared';
import { Card, Notice, btn } from '@/components/ui';
import { CartLink, Price } from './shop-bits';

export const metadata: Metadata = { title: 'Boutique' };

export default async function ShopPage() {
  const { profile } = await requireUser('/app/boutique');
  const { products, error } = await getShopCatalog();
  const percent = shopDiscountPercent(profile.plan);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight">Boutique</h1>
          <p className="text-muted">
            Vêtements et goodies Tracteurs & Co, imprimés à la demande en Europe et livrés chez vous, partout en France.
          </p>
        </div>
        {products.length ? (
          <div className="flex flex-wrap gap-2">
            <Link href="/app/boutique/commandes" className={btn.secondary}>Mes commandes</Link>
            <CartLink />
          </div>
        ) : null}
      </div>

      {products.length && percent ? (
        <Notice tone="green">Formule Complet : <strong>−{percent} %</strong> sur toute la boutique, déjà déduits des prix affichés.</Notice>
      ) : products.length ? (
        <Notice tone="gray">
          Avec la formule Complet, profitez de <strong>−{SHOP_MEMBER_DISCOUNT} %</strong> sur toute la boutique.{' '}
          <Link href="/app/abonnement" className="font-semibold text-brand-dark underline underline-offset-4">Découvrir la formule</Link>
        </Notice>
      ) : null}

      {!products.length ? (
        <Card className="flex flex-col items-start gap-3">
          <h2 className="text-xl font-semibold">La boutique ouvre bientôt</h2>
          <p className="max-w-2xl text-muted">
            T-shirts, sweats, casquettes et goodies aux couleurs de Tracteurs & Co arrivent très vite. Les membres de la formule Complet auront −{SHOP_MEMBER_DISCOUNT} % sur
            tout.
          </p>
          {profile.role === 'admin' ? (
            <p className="text-sm text-muted">
              Admin : {printfulConfigured() ? (error ? `Printful répond par une erreur (${error}).` : 'aucun produit en vente dans Printful pour le moment.') : 'la clé PRINTFUL_API_KEY n’est pas encore ajoutée dans Vercel.'}{' '}
              <Link href="/admin/boutique" className="font-semibold underline underline-offset-4">Voir la boutique dans l’admin</Link>
            </p>
          ) : null}
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-5">
          {products.map((p) => {
            const soldOut = p.variants.every((v) => !v.available);
            return (
              <li key={p.id}>
                <Link
                  href={`/app/boutique/${p.id}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lg"
                >
                  <span className="relative block aspect-square bg-[#f4f2ee]">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- maquettes servies par Printful
                      <img src={p.image} alt="" loading="lazy" className="size-full object-contain p-3 transition-transform duration-300 group-hover:scale-[1.03]" />
                    ) : null}
                    {soldOut ? <span className="absolute left-3 top-3 rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-page">Bientôt de retour</span> : null}
                  </span>
                  <span className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
                    <span className="font-semibold leading-snug">{p.name}</span>
                    {p.colors.length > 1 ? <span className="text-sm text-muted">{p.colors.length} couleurs</span> : null}
                    <span className="mt-auto pt-1">
                      <Price cents={p.fromCents} percent={percent} from={p.variants.some((v) => v.priceCents !== p.fromCents)} />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
