import Link from 'next/link';
import type { Route } from 'next';
import { Logo, btn } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import { MobileMenu } from '@/components/mobile-menu';
import { getSession } from '@/lib/auth';
import { shopIsOpen } from '@/lib/printful';

async function isLoggedIn() {
  try {
    return Boolean(await getSession());
  } catch {
    return false; // Supabase pas encore configuré : on affiche la version visiteur.
  }
}

const SITE_LINKS = [
  { href: '/gestion-de-parc', label: 'Gestion de parc' },
  { href: '/fiches', label: 'Fiches techniques' },
  { href: '/bourse', label: 'Bourse' },
  { href: '/blog', label: 'Conseils' },
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

export async function SiteFooter() {
  const shop = await shopIsOpen().catch(() => false);
  return (
    <footer className="no-print mt-auto border-t border-line bg-ground">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-x-10 gap-y-8 px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[15px] text-muted sm:px-6">
        <div className="flex flex-[1_1_220px] items-start gap-4">
          <Logo variant="embleme" height={64} />
          <span>
            © {new Date().getFullYear()} Tracteurs & Co
            <br />
            Tout pour le matériel agricole
          </span>
        </div>
        {[
          { title: 'Gérer', links: [['/gestion-de-parc', 'Gestion de parc'], ['/tarifs', 'Tarifs'], ['/app', 'Mon espace']] },
          { title: 'S’informer', links: [['/fiches', 'Fiches techniques'], ['/blog', 'Conseils']] },
          { title: 'Acheter & vendre', links: [['/bourse', 'Bourse au matériel'], ['/app/annonces/nouvelle', 'Vendre du matériel'], ...(shop ? [['/app/boutique', 'Boutique (membres)']] : [])] },
          { title: 'Tracteurs & Co', links: [['/contact', 'Contact'], ['/conditions', 'Conditions'], ['/confidentialite', 'Confidentialité'], ['/mentions-legales', 'Mentions légales']] },
        ].map((col) => (
          <nav key={col.title} aria-label={col.title} className="flex min-w-[140px] flex-col gap-2">
            <p className="font-semibold text-ink">{col.title}</p>
            {col.links.map(([href, label]) => (
              <Link key={href} href={href as Route} className="link-underline self-start transition-colors hover:text-ink">{label}</Link>
            ))}
          </nav>
        ))}
      </div>
    </footer>
  );
}
