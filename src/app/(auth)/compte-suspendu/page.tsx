import type { Metadata } from 'next';
import { signOut } from '../actions';
import { btn } from '@/components/ui';

export const metadata: Metadata = { title: 'Compte suspendu' };

export default function SuspendedPage() {
  return (
    <>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Compte suspendu</h1>
      <p className="mb-6 text-muted">
        Votre compte est temporairement suspendu. Vos données sont conservées. Contactez-nous pour le réactiver.
      </p>
      <form action={signOut}>
        <button type="submit" className={btn.secondary}>Se déconnecter</button>
      </form>
    </>
  );
}
