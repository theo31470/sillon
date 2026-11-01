import Link from 'next/link';
import type { Metadata } from 'next';
import { SignUpForm } from '../forms';
import { safeNext } from '@/lib/safe-redirect';

export const metadata: Metadata = { title: 'Créer un compte' };

export default async function SignUpPage(props: PageProps<'/inscription'>) {
  const { formule, periode, parrain, suite } = await props.searchParams;
  const invited = typeof parrain === 'string' && /^[A-Z0-9]{4,12}$/.test(parrain);
  const next =
    typeof suite === 'string' && suite.startsWith('/invitation/')
      ? safeNext(suite)
      : formule === 'complet' || invited
        ? `/app/abonnement${periode === 'annuel' ? '?periode=annuel' : ''}`
        : '/app';
  return (
    <>
      {invited ? (
        <p className="mb-5 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          <strong>Un membre vous invite.</strong> Avec son code <strong>{parrain}</strong>, vous avez un mois offert sur votre premier paiement, en plus des 30 jours d’essai de la
          formule Complet.
        </p>
      ) : null}
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Créer votre compte</h1>
      <p className="mb-6 text-muted">
        {formule === 'complet'
          ? 'Créez d’abord votre compte, puis choisissez la formule Complet : 30 jours offerts.'
          : 'Gratuit pour démarrer, sans carte bancaire.'}
      </p>
      <SignUpForm next={next} />
      <p className="mt-6 text-sm text-muted">
        Déjà inscrit ? <Link href="/connexion" className="font-semibold text-brand">Se connecter</Link>
      </p>
    </>
  );
}
