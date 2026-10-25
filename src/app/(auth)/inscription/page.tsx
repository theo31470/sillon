import Link from 'next/link';
import type { Metadata } from 'next';
import { SignUpForm } from '../forms';

export const metadata: Metadata = { title: 'Créer un compte' };

export default async function SignUpPage(props: PageProps<'/inscription'>) {
  const { formule, periode } = await props.searchParams;
  const next = formule === 'complet' ? `/app/abonnement${periode === 'annuel' ? '?periode=annuel' : ''}` : '/app';
  return (
    <>
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
