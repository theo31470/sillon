'use client';

/**
 * Coche d'un coup les valeurs qui ont une source.
 * À utiliser après avoir parcouru la fiche : la case reste décochable une par une.
 */
export function CheckSourced({ formId }: { formId: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        document.querySelectorAll<HTMLInputElement>(`#${formId} input[data-sourced="true"]`).forEach((box) => {
          box.checked = true;
        });
      }}
      className="btn inline-flex min-h-12 items-center rounded-[10px] border border-field bg-surface px-3.5 font-semibold text-ink hover:border-brand hover:text-brand-dark sm:px-4"
    >
      <span className="sm:hidden">Cocher les sourcées</span>
      <span className="hidden sm:inline">Cocher les valeurs sourcées</span>
    </button>
  );
}
