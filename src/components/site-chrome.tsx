import Link from 'next/link';
import { Logo, btn } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import { MobileMenu } from '@/components/mobile-menu';
import { getSession } from '@/lib/auth';

async function isLoggedIn() {
  try {
    return Boolean(await getSession());
  } catch {
    return false; // Supabase pas encore configuré : on affiche la version visiteur.
  }
}

const SITE_LINKS = [
  { href: '/#fonctions', label: 'Fonctionnalités' },
  { href: '/fiches', label: 'Fiches techniques' },
  { href: '/blog', label: 'Blog' },
  { href: '/tarifs', label: 'Tarifs' },
];

export async function SiteHeader() {
  const loggedIn = await isLoggedIn();
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-page/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:py-3.5" aria-label="Navigation du site">
        <Link href="/" aria-label="Tracteurs & Co, accueil" className="shrink-0 transition-opacity hover:opacity-80">
          <span className="lg:hidden"><Logo height={40} /></span>
          <span className="hidden lg:block"><Logo height={50} /></span>
        </Link>

        {/* Grand écran : tous les liens */}
        <div className="hidden items-center gap-x-7 font-medium lg:flex">
          {SITE_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="link-underline text-ink hover:text-brand">{l.label}</Link>
          ))}
          {loggedIn ? (
            <Link href="/app" className={btn.primary}>Mon espace</Link>
          ) : (
            <>
              <Link href="/connexion" className="link-underline text-ink hover:text-brand">Se connecter</Link>
              <Link href="/inscription" className={btn.primary}>Essai gratuit</Link>
            </>
          )}
          <ThemeToggle />
        </div>

        {/* Téléphone et tablette : action principale + menu */}
        <div className="flex items-center gap-2 lg:hidden">
          <Link href={loggedIn ? '/app' : '/inscription'} className={`${btn.primary} min-h-11 px-4 py-2 text-[15px]`}>
            {loggedIn ? 'Mon espace' : 'Essai gratuit'}
          </Link>
          <MobileMenu label="Menu du site">
            <nav aria-label="Navigation du site (mobile)" className="flex flex-col text-lg font-semibold">
              {SITE_LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="rounded-xl px-3 py-3.5 hover:bg-ground">{l.label}</Link>
              ))}
              <Link href="/contact" className="rounded-xl px-3 py-3.5 hover:bg-ground">Contact</Link>
            </nav>
            <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4">
              {loggedIn ? (
                <Link href="/app" className={btn.primary}>Mon espace</Link>
              ) : (
                <>
                  <Link href="/inscription" className={btn.primary}>Essai gratuit</Link>
                  <Link href="/connexion" className={btn.secondary}>Se connecter</Link>
                </>
              )}
              <div className="flex items-center justify-between px-1 text-sm text-muted">
                Thème clair ou sombre
                <ThemeToggle />
              </div>
            </div>
          </MobileMenu>
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="no-print mt-auto border-t border-line bg-ground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[15px] text-muted sm:px-6">
        <div className="flex items-center gap-4">
          <Logo variant="embleme" height={64} />
          <span>© {new Date().getFullYear()} Tracteurs & Co<br />Machinisme agricole</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Link href="/blog" className="link-underline transition-colors hover:text-ink">Blog</Link>
          <Link href="/fiches" className="link-underline transition-colors hover:text-ink">Fiches techniques</Link>
          <Link href="/mentions-legales" className="link-underline transition-colors hover:text-ink">Mentions légales</Link>
          <Link href="/confidentialite" className="link-underline transition-colors hover:text-ink">Confidentialité</Link>
          <Link href="/conditions" className="link-underline transition-colors hover:text-ink">Conditions</Link>
          <Link href="/contact" className="link-underline transition-colors hover:text-ink">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
