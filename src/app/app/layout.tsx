import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { Logo } from '@/components/ui';
import { AppNav } from './app-nav';
import { PageTransition } from '@/components/motion';
import { signOut } from '@/app/(auth)/actions';

export default async function AppLayout({ children }: LayoutProps<'/app'>) {
  const { profile } = await requireUser('/app');
  const initials = (profile.full_name || profile.email).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-ground">
      <header className="no-print border-b border-line bg-white">
        <div className="mx-auto flex min-h-[68px] max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-6">
          <Link href="/app" aria-label="Sillon, tableau de bord"><Logo /></Link>
          <AppNav isAdmin={profile.role === 'admin'} />
          <details className="relative">
            <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full bg-brand-soft font-semibold text-brand-dark transition hover:scale-105 hover:bg-brand hover:text-white" aria-label="Mon compte">
              {initials}
            </summary>
            <div className="absolute right-0 z-10 mt-2 flex w-56 flex-col rounded-xl border border-line bg-white p-2 shadow-lg">
              <p className="truncate px-3 py-2 text-sm text-muted">{profile.farm_name || profile.email}</p>
              <Link href="/app/compte" className="rounded-lg px-3 py-2 transition-colors hover:bg-ground">Mon compte</Link>
              <Link href="/app/abonnement" className="rounded-lg px-3 py-2 transition-colors hover:bg-ground">Abonnement</Link>
              {profile.role === 'admin' ? <Link href="/admin" className="rounded-lg px-3 py-2 transition-colors hover:bg-ground">Administration</Link> : null}
              <form action={signOut}>
                <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-danger hover:bg-danger-soft">Se déconnecter</button>
              </form>
            </div>
          </details>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <PageTransition>
          <div className="flex flex-col gap-6">{children}</div>
        </PageTransition>
      </main>
    </div>
  );
}
