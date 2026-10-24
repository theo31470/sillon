import Link from 'next/link';
import { Logo, btn } from '@/components/ui';
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
    <header className="border-b border-line bg-white">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4" aria-label="Navigation du site">
        <Link href="/" aria-label="Sillon, accueil">
          <Logo />
        </Link>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-2 font-medium">
          <Link href="/#fonctions" className="text-ink hover:text-brand">Fonctionnalités</Link>
          <Link href="/fiches" className="text-ink hover:text-brand">Fiches techniques</Link>
          <Link href="/blog" className="text-ink hover:text-brand">Blog</Link>
          <Link href="/tarifs" className="text-ink hover:text-brand">Tarifs</Link>
          {loggedIn ? (
            <Link href="/app" className={btn.primary}>Mon espace</Link>
          ) : (
            <>
              <Link href="/connexion" className="text-ink hover:text-brand">Se connecter</Link>
              <Link href="/inscription" className={btn.primary}>Essai gratuit</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-5 px-6 py-9 text-[15px] text-muted">
        <span>© {new Date().getFullYear()} Sillon</span>
        <div className="flex flex-wrap gap-6">
          <Link href="/blog" className="hover:text-ink">Blog</Link>
          <Link href="/fiches" className="hover:text-ink">Fiches techniques</Link>
          <Link href="/mentions-legales" className="hover:text-ink">Mentions légales</Link>
          <Link href="/confidentialite" className="hover:text-ink">Confidentialité</Link>
        </div>
      </div>
    </footer>
  );
}
