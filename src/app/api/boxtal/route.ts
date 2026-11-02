import { after, NextResponse } from 'next/server';
import { signatureValid } from '@/lib/boxtal';

export const dynamic = 'force-dynamic';

/**
 * Notifications Boxtal (suivi du colis, bordereau prêt). Boxtal attend une réponse en moins de 2 secondes :
 * la signature est vérifiée tout de suite, la transaction est mise à jour après la réponse.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!signatureValid(raw, request.headers.get('x-bxt-signature'))) {
    console.warn('[boxtal] notification refusée : signature invalide');
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let event: { type?: string; shippingOrderId?: string; shipmentExternalId?: string | null } = {};
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  const id = event.shippingOrderId;
  if (id && /^[A-Za-z0-9_-]{4,80}$/.test(id)) {
    after(async () => {
      try {
        const { onBoxtalEvent } = await import('@/lib/bourse-pay');
        await onBoxtalEvent(id, event.shipmentExternalId ?? null);
      } catch (err) {
        console.error('[boxtal] notification', event.type, err);
      }
    });
  }
  // Toujours 200 pour une expédition inconnue : sinon Boxtal réessaie pendant 24 heures.
  return NextResponse.json({ ok: true });
}
