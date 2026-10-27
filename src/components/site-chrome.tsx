import Link from 'next/link';
import { Logo, btn } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import { getSession } from '@/lib/auth';

async function isLoggedIn() {
  try {
    return Boolean(await getSession());
  } catch {
    return false; // Supabase pas encore configuré : on affiche la version visiteur.
  }
}

export async function SiteHeader() {
  const loggedIn = await isLoggedIn();
  return (
    <header className="no-print z-30 border-b border-line bg-page/85 backdrop-blur-md lg:sticky lg:top-0">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3.5" aria-label="Navigation du site">
        <Link href="/" aria-label="Tracteurs & Co, accueil" className="transition-opacity hover:opacity-80">
          <Logo height={50} />
        </Link>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-2 font-medium">
          <Link href="/#fonctions" className="link-underline text-ink hover:text-brand">Fonctionnalités</Link>
          <Link href="/fiches" className="link-underline text-ink hover:text-brand">Fiches techniques</Link>
          <Link href="/blog" className="link-underline text-ink hover:text-brand">Blog</Link>
          <Link href="/tarifs" className="link-underline text-ink hover:text-brand">Tarifs</Link>
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
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="no-print mt-auto border-t border-line bg-ground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-10 text-[15px] text-muted">
        <div className="flex items-center gap-4">
          <Logo variant="embleme" height={64} />
          <span>© {new Date().getFullYear()} Tracteurs & Co<br />Machinisme agricole</span>
        </div>
        <div className="flex flex-wrap gap-6">
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
