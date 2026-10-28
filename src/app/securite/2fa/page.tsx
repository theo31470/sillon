import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { safeNext } from '@/lib/safe-redirect';
import { Logo } from '@/components/ui';
import { MfaFlow } from './mfa-flow';

export const metadata: Metadata = { title: 'Double authentification' };

export default async function MfaPage(props: PageProps<'/securite/2fa'>) {
  const { suite, forcer } = await props.searchParams;
  const next = safeNext(typeof suite === 'string' ? suite : null, '/admin');
  const session = await getSession();
  if (!session) redirect(`/connexion?suite=${encodeURIComponent(`/securite/2fa?suite=${next}`)}`);

  return (
    <div className="flex min-h-full flex-1 flex-col items-center bg-admin px-6 py-12">
      <Link href="/" className="mb-8 flex flex-col items-center gap-3" aria-label="Tracteurs & Co, accueil">
        <Logo variant="vertical" tone="dark" height={110} />
        <span className="rounded-full bg-admin-2 px-2.5 py-1 text-xs font-semibold text-panel">Sécurité</span>
      </Link>
      <main className="w-full max-w-md rounded-2xl bg-surface p-6 sm:p-8">
        <h1 className="mb-4 text-2xl font-bold tracking-tight">Double authentification</h1>
        <MfaFlow next={next} force={forcer === '1'} />
      </main>
      <ul className="mt-6 flex max-w-md flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-panel">
        <li>Obligatoire pour l’espace administrateur</li>
        <li>Chaque validation est enregistrée</li>
      </ul>
    </div>
  );
}
