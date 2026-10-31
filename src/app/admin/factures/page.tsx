import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAdmin, hasRecentMfa } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatCents, frenchDate, type InvoiceRow } from '@/lib/invoices/types';
import { Badge, Notice, inputClass } from '@/components/ui';
import { InvoiceActions } from './invoice-actions';

export const metadata: Metadata = { title: 'Factures' };
export const dynamic = 'force-dynamic';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const FIRST_YEAR = 2026;
const parisYear = () => Number(new Date().toLocaleDateString('fr-FR', { year: 'numeric', timeZone: 'Europe/Paris' }));
const monthOf = (iso: string) => Number(new Date(iso).toLocaleDateString('fr-FR', { month: 'numeric', timeZone: 'Europe/Paris' })) - 1;

export default async function InvoicesPage(props: PageProps<'/admin/factures'>) {
  const { session } = await requireAdmin('/admin/factures');
  const sp = await props.searchParams;
  const currentYear = parisYear();
  const year = Math.min(currentYear, Math.max(FIRST_YEAR, Number(sp.annee) || currentYear));
  const month = sp.mois !== undefined && sp.mois !== '' && Number(sp.mois) >= 1 && Number(sp.mois) <= 12 ? Number(sp.mois) : null;
  const type = sp.type === 'facture' || sp.type === 'avoir' ? sp.type : 'tous';
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 60).replace(/[%_,()\\*]/g, '') : '';
  const recentMfa = hasRecentMfa(session);

  // Toute l'année (volumes modestes) : synthèse mensuelle et liste filtrée.
  const supabase = await createClient();
  const { data } = await supabase
    .from('invoices')
    .select('*')
    .gte('issued_at', `${year}-01-01T00:00:00+01:00`)
    .lt('issued_at', `${year + 1}-01-01T00:00:00+01:00`)
    .order('issued_at', { ascending: false });
  const all = (data ?? []) as InvoiceRow[];
  const byMonth = MONTHS.map((_, m) => {
    const rows = all.filter((r) => monthOf(r.issued_at) === m);
    const fa = rows.filter((r) => r.kind === 'facture').reduce((s, r) => s + r.total_cents, 0);
    const av = rows.filter((r) => r.kind === 'avoir').reduce((s, r) => s + r.total_cents, 0);
    return { m, count: rows.filter((r) => r.kind === 'facture').length, fa, av, net: fa - av };
  });
  const inScope = month ? all.filter((r) => monthOf(r.issued_at) === month - 1) : all;
  const totals = {
    factures: inScope.filter((r) => r.kind === 'facture'),
    avoirs: inScope.filter((r) => r.kind === 'avoir'),
  };
  const sum = (rows: InvoiceRow[]) => rows.reduce((s, r) => s + r.total_cents, 0);
  const net = sum(totals.factures) - sum(totals.avoirs);
  const clients = new Set(totals.factures.map((r) => r.user_id ?? r.customer.email)).size;
  const credited = new Map<string, number>();
  for (const r of all) if (r.kind === 'avoir' && r.credited_invoice_id) credited.set(r.credited_invoice_id, (credited.get(r.credited_invoice_id) ?? 0) + r.total_cents);
  const numberOf = new Map(all.map((r) => [r.id, r.number]));

  const needle = q.toLowerCase();
  const rows = inScope.filter(
    (r) =>
      (type === 'tous' || r.kind === type) &&
      (!needle || r.number.toLowerCase().includes(needle) || (r.customer.name ?? '').toLowerCase().includes(needle) || (r.customer.email ?? '').toLowerCase().includes(needle)),
  );
  const maxNet = Math.max(1, ...byMonth.map((b) => b.fa));
  const exportUrl = `/api/admin/factures/export?annee=${year}${month ? `&mois=${month}` : ''}`;
  const link = (params: Record<string, string | number | null | undefined>) => {
    const u = new URLSearchParams();
    const merged = { annee: year !== currentYear ? year : undefined, mois: month ?? undefined, type: type !== 'tous' ? type : undefined, q: q || undefined, ...params };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
    const s = u.toString();
    return `/admin/factures${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Factures</h1>
          <p className="text-muted">Factures et avoirs émis par Tracteurs &amp; Co, numérotés sans trou et non modifiables.</p>
        </div>
        <a href={exportUrl} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-brand px-4 py-2.5 font-semibold text-on-brand hover:bg-brand-dark">
          Exporter le livre des recettes (CSV)
        </a>
      </div>

      {/* Période */}
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: currentYear - FIRST_YEAR + 1 }, (_, i) => currentYear - i).map((y) => (
          <Link key={y} href={link({ annee: y === currentYear ? undefined : y, mois: undefined })} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${y === year ? 'border-brand bg-brand-tint text-brand-dark' : 'border-line hover:border-brand'}`}>
            {y}
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        <Link href={link({ mois: undefined })} className={`rounded-full border px-3 py-1.5 text-sm ${!month ? 'border-brand bg-brand-tint font-semibold text-brand-dark' : 'border-line hover:border-brand'}`}>
          Toute l’année
        </Link>
        {MONTHS.map((name, i) => (
          <Link key={name} href={link({ mois: i + 1 })} className={`rounded-full border px-3 py-1.5 text-sm capitalize ${month === i + 1 ? 'border-brand bg-brand-tint font-semibold text-brand-dark' : 'border-line hover:border-brand'}`}>
            {name.slice(0, 4)}
            {name.length > 4 ? '.' : ''}
          </Link>
        ))}
      </div>

      {/* Chiffres clés */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4">
        {[
          { label: 'Encaissé (factures)', value: formatCents(sum(totals.factures)), sub: `${totals.factures.length} facture${totals.factures.length > 1 ? 's' : ''}` },
          { label: 'Remboursé (avoirs)', value: formatCents(sum(totals.avoirs)), sub: `${totals.avoirs.length} avoir${totals.avoirs.length > 1 ? 's' : ''}` },
          { label: 'Chiffre d’affaires net', value: formatCents(net), sub: month ? `${MONTHS[month - 1]} ${year}` : `année ${year}` },
          { label: 'Clients facturés', value: String(clients), sub: 'sur la période' },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-line bg-surface p-3.5 sm:p-5">
            <p className="mb-1.5 text-sm text-muted">{k.label}</p>
            <p className="text-[22px] font-bold tabular-nums sm:text-[26px]">{k.value}</p>
            <p className="mt-1 text-[13px] text-muted">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Mois par mois */}
      {!month ? (
        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
          <h2 className="mb-1 text-lg font-semibold">Mois par mois</h2>
          <p className="mb-4 text-sm text-muted">Chiffre d’affaires net (factures moins avoirs), à déclarer à l’Urssaf selon votre rythme de déclaration.</p>
          <div className="scroll-x">
            <table className="w-full min-w-[600px] border-collapse whitespace-nowrap text-sm">
              <thead>
                <tr className="text-left text-[13px] text-muted">
                  {['Mois', 'Factures', 'Encaissé', 'Avoirs', 'Net', ''].map((h) => <th key={h} className="border-b border-line px-2 py-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {byMonth.map((b) => (
                  <tr key={b.m} className={b.count || b.av ? '' : 'text-muted'}>
                    <td className="border-b border-line-soft px-2 py-2 capitalize">
                      <Link href={link({ mois: b.m + 1 })} className="hover:text-brand">{MONTHS[b.m]}</Link>
                    </td>
                    <td className="border-b border-line-soft px-2 py-2 tabular-nums">{b.count || '—'}</td>
                    <td className="border-b border-line-soft px-2 py-2 tabular-nums">{b.fa ? formatCents(b.fa) : '—'}</td>
                    <td className="border-b border-line-soft px-2 py-2 tabular-nums">{b.av ? `− ${formatCents(b.av)}` : '—'}</td>
                    <td className="border-b border-line-soft px-2 py-2 font-semibold tabular-nums">{b.fa || b.av ? formatCents(b.net) : '—'}</td>
                    <td className="w-1/3 border-b border-line-soft px-2 py-2">
                      <div className="h-2 overflow-hidden rounded-full bg-ground">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(0, (b.net / maxNet) * 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!recentMfa ? (
        <Notice>
          Les remboursements demandent un code récent :{' '}
          <Link href={`/securite/2fa?forcer=1&suite=${encodeURIComponent(link({}))}`} className="font-semibold underline">validez à nouveau votre code</Link> (valable 15 min).
        </Notice>
      ) : null}

      {/* Liste */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <form action="/admin/factures" className="flex min-w-0 flex-1 flex-wrap gap-2">
            {year !== currentYear ? <input type="hidden" name="annee" value={year} /> : null}
            {month ? <input type="hidden" name="mois" value={month} /> : null}
            <input name="q" type="search" defaultValue={q} placeholder="Numéro, client, e-mail…" className={`${inputClass.replace('w-full ', '')} w-full min-w-0 sm:w-72 sm:flex-none`} />
            <select name="type" defaultValue={type} className={`${inputClass.replace('w-full ', '')} min-w-0 flex-1 sm:w-auto sm:flex-none`} aria-label="Type de document">
              <option value="tous">Factures et avoirs</option>
              <option value="facture">Factures</option>
              <option value="avoir">Avoirs</option>
            </select>
            <button type="submit" className="min-h-12 rounded-[10px] border border-field px-4 font-semibold hover:border-brand">Filtrer</button>
          </form>
          <p className="text-sm text-muted">{rows.length} document{rows.length > 1 ? 's' : ''}</p>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-muted">Aucun document sur cette période.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map((r) => {
              const left = r.kind === 'facture' ? r.total_cents - (credited.get(r.id) ?? 0) : 0;
              return (
                <li key={r.id} className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <a href={`/api/factures/${r.id}`} target="_blank" rel="noopener" className="font-semibold tabular-nums hover:text-brand">{r.number}</a>
                      {r.kind === 'avoir' ? <Badge tone="amber">Avoir</Badge> : credited.get(r.id) ? <Badge tone={left ? 'amber' : 'gray'}>{left ? 'Remboursée en partie' : 'Remboursée'}</Badge> : <Badge tone="green">Payée</Badge>}
                      {r.kind === 'avoir' && r.credited_invoice_id ? <span className="text-sm text-muted">sur {numberOf.get(r.credited_invoice_id) ?? 'facture'}</span> : null}
                    </p>
                    <p className="truncate text-sm text-muted">
                      {frenchDate(r.issued_at)} ·{' '}
                      {r.user_id ? <Link href={`/admin/membres/${r.user_id}`} className="hover:text-brand">{r.customer.name || r.customer.email}</Link> : <span>{r.customer.name || r.customer.email} (compte supprimé)</span>}
                      {r.payment_method ? ` · ${r.payment_method}` : ''}
                    </p>
                  </div>
                  <p className={`font-bold tabular-nums md:w-28 md:text-right ${r.kind === 'avoir' ? 'text-success' : ''}`}>
                    {r.kind === 'avoir' ? '− ' : ''}
                    {formatCents(r.total_cents, r.currency)}
                  </p>
                  <div className="md:w-[300px]">
                    <InvoiceActions id={r.id} kind={r.kind} refundableCents={left} currency={r.currency} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="text-[13px] text-muted">
        Le livre des recettes (obligatoire en micro-entreprise) liste chaque encaissement : date, numéro, client, nature, mode de règlement et montant. L’export CSV s’ouvre dans Excel ou
        LibreOffice ; gardez-le avec vos documents comptables.
      </p>
    </>
  );
}
