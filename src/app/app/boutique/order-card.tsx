import { formatDate, formatEuros } from '@/lib/format';
import { SHOP_STATUS_LABELS } from '@/lib/shop-shared';
import { orderReference, type ShopOrderRow } from '@/lib/shop';
import { Badge, Card, Logo } from '@/components/ui';

const TONES: Partial<Record<ShopOrderRow['status'], 'green' | 'amber' | 'gray'>> = {
  paid: 'amber',
  submitted: 'amber',
  shipped: 'green',
  failed: 'amber',
};

/** Une commande de la boutique, vue par son acheteur. */
export function OrderCard({ order }: { order: ShopOrderRow }) {
  const r = order.recipient;
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Commande {orderReference(order.id)}</h2>
          <p className="text-sm text-muted">Passée le {formatDate(order.paid_at ?? order.created_at)}</p>
        </div>
        <Badge tone={TONES[order.status] ?? 'gray'}>{SHOP_STATUS_LABELS[order.status]}</Badge>
      </div>

      <ul className="flex flex-col gap-3">
        {order.items.map((i) => (
          <li key={i.sync_variant_id} className="flex items-center gap-3">
            <span className="size-14 flex-none overflow-hidden rounded-lg bg-[#f4f2ee]">
              {i.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- maquettes servies par Printful
                <img src={i.image} alt="" className="size-full object-contain p-1" />
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{i.quantity} × {i.name}</span>
              {i.detail ? <span className="text-sm text-muted">{i.detail}</span> : null}
            </span>
            <span className="font-semibold">{formatEuros(i.unit_cents * i.quantity)}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap justify-between gap-x-6 gap-y-2 border-t border-line pt-3 text-sm">
        <span className="text-muted">
          {order.discount_cents ? <>Remise −{formatEuros(order.discount_cents)} · </> : null}
          Livraison {formatEuros(order.shipping_cents)}
        </span>
        <span className="font-bold">Total {formatEuros(order.total_cents)}</span>
      </div>

      {order.tracking.length ? (
        <div className="rounded-xl bg-success-soft px-4 py-3 text-sm">
          {order.tracking.map((t) => (
            <p key={t.number}>
              Expédiée{t.shipped_at ? ` le ${formatDate(t.shipped_at)}` : ''} par <strong>{t.carrier}</strong> :{' '}
              {t.url ? (
                <a href={t.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">suivre le colis {t.number}</a>
              ) : (
                <>n° {t.number}</>
              )}
            </p>
          ))}
        </div>
      ) : null}
      {['paid', 'submitted', 'shipped'].includes(order.status) ? <OrderTimeline order={order} /> : order.status === 'failed' ? (
        <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm">Votre commande demande une vérification : nous nous en occupons et revenons vers vous rapidement.</p>
      ) : null}

      {r ? <p className="text-sm text-muted">Livraison à {[r.name, r.address1, r.address2, `${r.zip} ${r.city}`].filter(Boolean).join(', ')}</p> : null}
    </Card>
  );
}

/** Temps écoulé depuis une date (rendu serveur : calculé à chaque affichage de la page). */
const msSince = (d: Date) => Math.max(0, Date.now() - d.getTime());

/** Ajoute des jours ouvrés (hors samedi et dimanche). */
function addBusinessDays(from: Date, days: number) {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

const short = (d: Date | string) => formatDate(d, { day: 'numeric', month: 'long', year: undefined });
const tiny = (d: Date | string) => formatDate(d, { day: 'numeric', month: 'short', year: undefined });

/** Suivi animé : payée → à l'atelier → expédiée → chez vous, le tracteur avance avec le colis. */
export function OrderTimeline({ order }: { order: ShopOrderRow }) {
  const [min, max] = (order.shipping_label?.match(/\d+/g) ?? []).map(Number);
  const shippedAt = order.shipped_at ?? order.tracking[0]?.shipped_at ?? null;
  const reached = order.status === 'shipped' ? 2 : order.status === 'submitted' ? 1 : 0;
  let arrival: string | null = null;
  let arrivalShort: string | null = null;
  let fraction = reached / 3;
  if (shippedAt && max) {
    const start = new Date(shippedAt);
    const first = addBusinessDays(start, min || max);
    const last = addBusinessDays(start, max);
    const same = first.toDateString() === last.toDateString();
    arrival = same ? `vers le ${short(last)}` : `entre le ${short(first)} et le ${short(last)}`;
    arrivalShort = same ? tiny(last) : `${first.getDate()}–${tiny(last)}`;
    // En route : le tracteur avance jour après jour vers « Chez vous », sans jamais l'atteindre tout seul.
    const total = last.getTime() - start.getTime();
    const elapsed = msSince(start);
    fraction = (2 + Math.min(0.85, total > 0 ? elapsed / total : 0)) / 3;
  }
  const steps = [
    { label: 'Payée', sub: order.paid_at ? tiny(order.paid_at) : '' },
    { label: 'À l’atelier', sub: order.submitted_at ? 'impression' : 'bientôt' },
    { label: 'Expédiée', sub: shippedAt ? tiny(shippedAt) : 'sous 2 à 5 j' },
    { label: 'Chez vous', sub: arrivalShort ?? (order.shipping_label ? `+ ${order.shipping_label.replace(' ouvrés', '')}` : '') },
  ];
  const pct = `${Math.round(fraction * 1000) / 10}%`;

  return (
    <div className="rounded-xl bg-ground px-4 pb-4 pt-5">
      <div className="relative mx-[12.5%] mb-3 h-[34px]">
        <span aria-hidden="true" className="absolute inset-x-0 bottom-[6px] h-[4px] rounded-full bg-line" />
        <span aria-hidden="true" className="track-fill absolute bottom-[6px] left-0 h-[4px] rounded-full bg-brand" style={{ width: pct }} />
        <span aria-hidden="true" className="track-tractor absolute bottom-[8px] -translate-x-1/2" style={{ left: pct }}>
          <Logo variant="icone" height={26} className="track-bump" />
        </span>
      </div>
      <ol className="grid grid-cols-4 text-center">
        {steps.map((s, i) => (
          <li key={s.label} className="flex flex-col items-center gap-1">
            <span
              className={`flex size-6 items-center justify-center rounded-full border-2 text-[11px] font-bold ${
                i <= reached ? 'border-brand bg-brand text-on-brand' : i === reached + 1 ? 'track-current border-brand bg-surface text-brand-dark' : 'border-line bg-surface text-muted'
              }`}
            >
              {i <= reached ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span className={`text-xs font-semibold sm:text-sm ${i <= reached + 1 ? 'text-ink' : 'text-muted'}`}>{s.label}</span>
            <span className="text-[11px] leading-tight text-muted sm:text-xs">{s.sub}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-center text-sm text-muted">
        {order.status === 'shipped'
          ? `Votre colis est en route${arrival ? ` : livraison prévue ${arrival}` : ''}.`
          : order.status === 'submitted'
            ? 'Vos articles sont à l’atelier : ils sont imprimés rien que pour vous, puis expédiés. Le numéro de suivi vous sera envoyé par e-mail.'
            : 'Paiement reçu : la commande part à l’atelier d’impression.'}
      </p>
    </div>
  );
}
