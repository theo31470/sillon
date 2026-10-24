'use client';

import { btn } from '@/components/ui';

/** Page affichée en cas d'erreur inattendue (sans divulguer de détail technique). */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 bg-ground px-6 py-20 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Un problème est survenu</h1>
      <p className="max-w-md text-muted">Réessayez dans un instant. Si le problème continue, contactez-nous.</p>
      <button type="button" onClick={reset} className={btn.primary}>Réessayer</button>
    </main>
  );
}
