import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { Logo } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import { AppNav, AppTabBar } from './app-nav';
import { PageTransition } from '@/components/motion';
import { signOut } from '@/app/(auth)/actions';

export default async function AppLayout({ children }: LayoutProps<'/app'>) {
  const { profile } = await requireUser('/app');
  const initials = (profile.full_name || profile.email).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-ground">
      <header className="no-print sticky top-0 z-30 border-b border-line bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur-md md:static md:bg-surface md:backdrop-blur-none">
        <div className="mx-auto flex min-h-14 max-w-6xl items-center gap-x-3 gap-y-2 px-4 sm:px-6 md:min-h-[68px] md:gap-x-8">
          <Link href="/app" aria-label="Tracteurs & Co, tableau de bord" className="mr-auto md:mr-0">
            <span className="md:hidden"><Logo height={34} /></span>
            <span className="hidden md:block"><Logo height={44} /></span>
          </Link>
          <AppNav isAdmin={profile.role === 'admin'} />
          <ThemeToggle />
          <details className="relative">
            <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full bg-brand-soft font-semibold text-brand-dark transition hover:scale-105 hover:bg-brand hover:text-on-brand" aria-label="Mon compte">
              {initials}
            </summary>
            <div className="absolute right-0 z-10 mt-2 flex w-60 flex-col rounded-xl border border-line bg-surface p-2 shadow-lg [&_a]:py-2.5 [&_button]:py-2.5">
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
      <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 md:py-8">
        <PageTransition>
          <div className="flex flex-col gap-5 md:gap-6">{children}</div>
        </PageTransition>
      </main>
      <AppTabBar />
    </div>
  );
}
