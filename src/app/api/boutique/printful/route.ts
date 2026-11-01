import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { syncShopOrder } from '@/lib/shop';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Notifications de Printful (colis expédié, commande bloquée ou annulée).
 * On ne croit pas le contenu reçu : il sert seulement à savoir quelle commande
 * relire, et l'état réel est redemandé à l'API Printful avec notre clé.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'inconnu';
  if (!rateLimit(`printful-hook:${ip}`, 60, 60_000).ok) return NextResponse.json({ ok: false }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { type?: string; data?: { order?: { id?: number; external_id?: string } } } | null;
  const pfId = Number(body?.data?.order?.id);
  if (!Number.isSafeInteger(pfId) || pfId <= 0) return NextResponse.json({ ok: true });

  const { data: order } = await createServiceClient().from('shop_orders').select('id').eq('printful_order_id', pfId).maybeSingle();
  if (!order) return NextResponse.json({ ok: true });
  try {
    await syncShopOrder(order.id as string);
  } catch (err) {
    console.error('[boutique] notification Printful', body?.type, err);
    // 500 : Printful renverra la notification plus tard.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
