import { Logo } from '@/components/ui';

/** Écran d'attente pendant le chargement d'une page : le tracteur du logo qui laboure. */
export function PageLoader({ label = 'Chargement…', skeleton = true }: { label?: string; skeleton?: boolean }) {
  return (
    <div role="status" aria-live="polite" className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col items-center gap-3 py-6">
        <div className="loader-track" aria-hidden="true">
          <Logo variant="icone" height={46} className="loader-tractor" />
          <div className="loader-furrows" />
        </div>
        <p className="text-sm font-medium text-muted">{label}</p>
      </div>
      {skeleton ? (
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="loader-skeleton h-36" />
              <div className="flex flex-col gap-2.5 p-4">
                <div className="loader-skeleton h-3 w-1/3 rounded-full" />
                <div className="loader-skeleton h-4 w-3/4 rounded-full" />
                <div className="loader-skeleton h-3 w-1/2 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
