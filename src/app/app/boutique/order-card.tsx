import { formatDate, formatEuros } from '@/lib/format';
import { SHOP_STATUS_LABELS } from '@/lib/shop-shared';
import { orderReference, type ShopOrderRow } from '@/lib/shop';
import { Badge, Card } from '@/components/ui';

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
      ) : order.status === 'submitted' || order.status === 'paid' ? (
        <p className="rounded-xl bg-ground px-4 py-3 text-sm text-muted">
          En cours d’impression{order.shipping_label ? `, livraison estimée en ${order.shipping_label}` : ''}. Vous recevrez le numéro de suivi par e-mail dès l’envoi.
        </p>
      ) : order.status === 'failed' ? (
        <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm">Votre commande demande une vérification : nous nous en occupons et revenons vers vous rapidement.</p>
      ) : null}

      {r ? <p className="text-sm text-muted">Livraison à {[r.name, r.address1, r.address2, `${r.zip} ${r.city}`].filter(Boolean).join(', ')}</p> : null}
    </Card>
  );
}
