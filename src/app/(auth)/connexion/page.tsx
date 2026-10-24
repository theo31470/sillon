import Link from 'next/link';
import type { Metadata } from 'next';
import { safeNext } from '@/lib/safe-redirect';
import { SignInForm } from '../forms';

export const metadata: Metadata = { title: 'Connexion' };

export default async function SignInPage(props: PageProps<'/connexion'>) {
  const { suite } = await props.searchParams;
  return (
    <>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Connexion</h1>
      <SignInForm next={safeNext(typeof suite === 'string' ? suite : null)} />
      <div className="mt-6 flex flex-col gap-2 text-sm text-muted">
        <Link href="/mot-de-passe-oublie" className="text-brand">Mot de passe oublié ?</Link>
        <p>
          Pas encore de compte ? <Link href="/inscription" className="font-semibold text-brand">Créer un compte gratuit</Link>
        </p>
      </div>
    </>
  );
}
