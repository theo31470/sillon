import Link from 'next/link';
import type { Metadata } from 'next';
import { ResetRequestForm } from '../forms';

export const metadata: Metadata = { title: 'Mot de passe oublié' };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Mot de passe oublié</h1>
      <p className="mb-6 text-muted">Indiquez votre adresse : nous vous envoyons un lien pour en choisir un nouveau.</p>
      <ResetRequestForm />
      <Link href="/connexion" className="mt-6 inline-block text-sm text-brand">Retour à la connexion</Link>
    </>
  );
}
