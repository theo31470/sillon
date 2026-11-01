/** Frise des étapes d'un paiement : chaque étape se coche dès qu'elle est remplie. */
export function PaySteps({ steps }: { steps: { label: string; done: boolean }[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  const current = steps.findIndex((s) => !s.done);
  return (
    <div className="flex flex-col gap-2" aria-label={`Étapes : ${doneCount} sur ${steps.length} terminées`}>
      <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        <span aria-hidden="true" className="absolute left-[calc(100%/var(--n)/2)] right-[calc(100%/var(--n)/2)] top-[15px] h-[3px] rounded-full bg-line" style={{ ['--n' as string]: steps.length }}>
          <span className="pay-steps-bar block h-full rounded-full bg-brand" style={{ width: `${(Math.max(0, current === -1 ? steps.length - 1 : current) / (steps.length - 1)) * 100}%` }} />
        </span>
        {steps.map((s, i) => (
          <li key={s.label} className="relative flex flex-col items-center gap-1.5 text-center">
            <span
              data-done={s.done}
              className={`pay-step-dot flex size-8 items-center justify-center rounded-full border-2 text-sm font-bold ${
                s.done ? 'border-brand bg-brand text-on-brand' : i === current ? 'track-current border-brand bg-surface text-brand-dark' : 'border-line bg-surface text-muted'
              }`}
            >
              {s.done ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span className={`text-xs font-semibold sm:text-sm ${s.done || i === current ? 'text-ink' : 'text-muted'}`}>
              {s.label}
              <span className="sr-only">{s.done ? ' : terminé' : i === current ? ' : en cours' : ''}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export type PayStage = { label: string } | null;

/** Contenu du bouton de paiement : libellé, étapes pendant le paiement, puis coche de réussite. */
export function PayButtonContent({ idle, stage, done }: { idle: string; stage: PayStage; done: string | null }) {
  if (done) {
    return (
      <span className="flex items-center gap-2">
        <svg className="pay-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {done}
      </span>
    );
  }
  if (stage) {
    return (
      <span className="flex items-center gap-2" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <span key={stage.label} className="celebrate-rise">{stage.label}</span>
      </span>
    );
  }
  return <>{idle}</>;
}
