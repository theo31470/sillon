/** Écran d'attente pendant le chargement d'une page : un petit tracteur qui laboure. */
export function PageLoader({ label = 'Chargement…', skeleton = true }: { label?: string; skeleton?: boolean }) {
  return (
    <div role="status" aria-live="polite" className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col items-center gap-3 py-6">
        <div className="loader-track" aria-hidden="true">
          <svg className="loader-tractor" width="64" height="44" viewBox="0 0 64 44">
            <circle cx="16" cy="30" r="12" fill="#26302a" />
            <circle cx="16" cy="30" r="6" fill="#d9b45a" />
            <circle cx="50" cy="35" r="7" fill="#26302a" />
            <circle cx="50" cy="35" r="3.5" fill="#d9b45a" />
            <path d="M26 20h26c3 0 5 2 5 5v6H26z" fill="#2f6d3a" />
            <path d="M8 4h20v20H8z" fill="#1d2420" />
            <path d="M10 6h16v12H10z" fill="#d4e6ec" />
            <path d="M6 2h24l1 3H5z" fill="#21512a" />
            <path d="M40 11h3v10h-3z" fill="#1d2420" />
          </svg>
          <div className="loader-furrows" />
        </div>
        <p className="text-sm font-medium text-muted">{label}</p>
      </div>
      {skeleton ? (
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-line bg-white">
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
