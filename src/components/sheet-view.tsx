import type { SheetContent } from '@/lib/sheets/schema';
import { Badge } from '@/components/ui';

function SourceTag({ source }: { source: { document: string; page: number | null } | null }) {
  if (!source) return null;
  return (
    <span className="text-xs text-muted">
      {source.document}
      {source.page ? `, p. ${source.page}` : ''}
    </span>
  );
}

/** Affichage d'une fiche technique (site public et aperçu admin). */
export function SheetView({ content, showSources = false }: { content: SheetContent; showSources?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {content.specs.length > 0 ? (
        <section id="caracteristiques" className="rounded-2xl border border-line bg-white p-6">
          <h2 className="mb-5 text-2xl font-bold">Caractéristiques techniques</h2>
          <div className="grid gap-x-9 gap-y-6 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
            {content.specs.map((group) => (
              <div key={group.group}>
                <h3 className="mb-1.5 font-semibold text-brand">{group.group}</h3>
                <dl className="grid grid-cols-[1fr_auto] text-[15px]">
                  {group.items.map((item) => (
                    <div key={item.label} className="contents">
                      <dt className="border-b border-[#eef0eb] py-2.5 text-muted">{item.label}</dt>
                      <dd className="border-b border-[#eef0eb] py-2.5 text-right">
                        {item.value ?? '—'}
                        {showSources ? <><br /><SourceTag source={item.source} /></> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {content.maintenance.length > 0 ? (
        <section id="entretien" className="rounded-2xl border border-line bg-white p-6">
          <h2 className="mb-4 text-2xl font-bold">Entretien</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[15px]">
              <thead>
                <tr className="text-left text-sm text-muted">
                  <th className="border-b border-[#dce1d6] p-2.5 font-medium">Opération</th>
                  <th className="border-b border-[#dce1d6] p-2.5 font-medium">Tous les</th>
                  <th className="border-b border-[#dce1d6] p-2.5 font-medium">Produit</th>
                  <th className="border-b border-[#dce1d6] p-2.5 font-medium">Quantité</th>
                </tr>
              </thead>
              <tbody>
                {content.maintenance.map((m) => (
                  <tr key={m.operation}>
                    <td className="border-b border-[#eef0eb] p-2.5 font-medium">{m.operation}</td>
                    <td className="border-b border-[#eef0eb] p-2.5">
                      {[m.interval_hours ? `${m.interval_hours} h` : null, m.interval_months ? `${m.interval_months} mois` : null].filter(Boolean).join(' ou ') || '—'}
                    </td>
                    <td className="border-b border-[#eef0eb] p-2.5">{m.product ?? '—'}</td>
                    <td className="border-b border-[#eef0eb] p-2.5">{m.capacity ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3.5 text-sm text-muted">Le manuel du constructeur fait toujours foi.</p>
        </section>
      ) : null}

      {content.faults.length > 0 ? (
        <section id="pannes" className="flex flex-col gap-3.5 rounded-2xl border border-line bg-white p-6">
          <h2 className="text-2xl font-bold">Pannes fréquentes</h2>
          {content.faults.map((f, i) => (
            <details key={f.symptom} open={i === 0} className="rounded-xl border border-line px-5 py-4">
              <summary className="cursor-pointer text-[17px] font-semibold">
                {f.symptom}{' '}
                {f.difficulty === 'facile' ? <Badge tone="green">Réparable soi-même</Badge> : <Badge tone="amber">Atelier conseillé</Badge>}
              </summary>
              <div className="mt-4 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                <div>
                  <p className="mb-2 text-sm font-semibold text-muted">Causes possibles</p>
                  <ul className="list-disc pl-5">{f.causes.map((c) => <li key={c}>{c}</li>)}</ul>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-muted">À vérifier, dans l’ordre</p>
                  <ol className="list-decimal pl-5">{f.checks.map((c) => <li key={c}>{c}</li>)}</ol>
                </div>
              </div>
            </details>
          ))}
        </section>
      ) : null}

      {content.parts.length > 0 ? (
        <section id="pieces" className="rounded-2xl border border-line bg-white p-6">
          <h2 className="mb-4 text-2xl font-bold">Pièces d’entretien</h2>
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            {content.parts.map((p) => (
              <div key={p.name} className="rounded-xl border border-line p-4">
                <p className="font-semibold">{p.name}{p.quantity ? ` ×${p.quantity}` : ''}</p>
                <p className="mt-0.5 text-sm text-muted">Réf. {p.reference ?? 'à compléter'}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
