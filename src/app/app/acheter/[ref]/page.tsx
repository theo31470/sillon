import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getListingByRef } from '@/lib/bourse';
import { quote, securePaymentBlocker } from '@/lib/bourse-pay';
import { listingPath, priceLabel } from '@/lib/bourse-shared';
import { SITE } from '@/lib/site';
import { Card, Notice, btn } from '@/components/ui';
import { BuyForm } from './buy-form';

export const metadata: Metadata = { title: 'Acheter · Bourse' };

export default async function BuyPage(props: PageProps<'/app/acheter/[ref]'>) {
  const { ref } = await props.params;
  const { session, profile } = await requireUser(`/app/acheter/${ref}`);
  const l = await getListingByRef(ref);
  if (!l) notFound();
  if (l.seller_id === session.userId) redirect(listingPath(l));
  const blocker = await securePaymentBlocker(l);
  const modes = (l.delivery === 'les_deux' ? ['main_propre', 'envoi'] : [l.delivery]).filter((m) => m !== 'envoi' || l.shipping_cents !== null) as ('envoi' | 'main_propre')[];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <Link href={listingPath(l)} className="self-start font-semibold text-brand-dark hover:underline">← Retour à l’annonce</Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Acheter en toute sécurité</h1>
        <p className="text-muted">L’argent n’est versé au vendeur qu’une fois le matériel entre vos mains.</p>
      </div>
      {blocker || !modes.length ? (
        <Card className="flex flex-col items-start gap-3">
          <Notice tone="gray">{blocker ?? 'Cette annonce ne peut pas être achetée en ligne.'}</Notice>
          <Link href={listingPath(l)} className={btn.primary}>Contacter le vendeur</Link>
        </Card>
      ) : profile.is_demo ? (
        <Card className="flex flex-col items-start gap-3">
          <p>Vous êtes sur la démo : créez votre compte gratuit pour acheter.</p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- navigation complète : la session de démo se pose par cookie */}
          <a href="/demo/fin" className={btn.primary}>Créer mon compte</a>
        </Card>
      ) : (
        <BuyForm
          listing={{ ref: l.ref, title: l.title, photo: l.photos[0]?.url ?? null, price: priceLabel(l.price_cents), city: `${l.city} (${l.department})` }}
          quotes={Object.fromEntries(modes.map((m) => [m, quote(l, m)])) as Record<'envoi' | 'main_propre', ReturnType<typeof quote>>}
          modes={modes}
          defaultName={profile.full_name}
          vatMention={SITE.vatMention}
        />
      )}
    </div>
  );
}
