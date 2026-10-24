import Link from 'next/link';
import { Logo, btn } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 bg-ground px-6 py-20 text-center">
      <Logo />
      <h1 className="text-3xl font-bold tracking-tight">Page introuvable</h1>
      <p className="max-w-md text-muted">Cette page n’existe pas ou a été déplacée.</p>
      <Link href="/" className={btn.primary}>Retour à l’accueil</Link>
    </main>
  );
}
