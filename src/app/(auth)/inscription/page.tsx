import Link from 'next/link';
import type { Metadata } from 'next';
import { SignUpForm } from '../forms';

export const metadata: Metadata = { title: 'Créer un compte' };

export default function SignUpPage() {
  return (
    <>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Créer votre compte</h1>
      <p className="mb-6 text-muted">Gratuit pour démarrer, sans carte bancaire.</p>
      <SignUpForm />
      <p className="mt-6 text-sm text-muted">
        Déjà inscrit ? <Link href="/connexion" className="font-semibold text-brand">Se connecter</Link>
      </p>
    </>
  );
}
