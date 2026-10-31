import 'server-only';
import type Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/admin';
import { syncPlan } from '@/lib/membership';
import type { Plan } from '@/lib/types';

const customerIdOf = (c: string | Stripe.Customer | Stripe.DeletedCustomer | null) => (typeof c === 'string' ? c : c?.id ?? null);

/**
 * Recopie un abonnement Stripe dans la base et recalcule la formule du membre.
 * Appelée par le webhook, et tout de suite après une action sur le site
 * (l'écran est à jour sans attendre le webhook). Idempotente.
 */
export async function upsertSubscription(sub: Stripe.Subscription, userIdHint?: string | null) {
  const db = createServiceClient();
  const customer = customerIdOf(sub.customer);
  const { data: owner } = customer ? await db.from('profiles').select('id').eq('stripe_customer_id', customer).maybeSingle() : { data: null };
  const userId = (owner?.id as string | undefined) ?? userIdHint ?? sub.metadata?.user_id ?? null;
  if (!userId) {
    console.warn('[stripe] abonnement sans compte associé', sub.id);
    return null;
  }
  const item = sub.items.data[0];
  const plan: Plan = sub.metadata?.plan === 'groupement' ? 'groupement' : 'complet';
  await db.from('subscriptions').upsert({
    id: sub.id,
    user_id: userId,
    status: sub.status,
    plan,
    price_id: item?.price.id ?? null,
    current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    // Résiliation programmée : booléen historique, ou date « cancel_at ».
    cancel_at_period_end: sub.cancel_at_period_end || Boolean(sub.cancel_at),
  });
  // La formule du profil suit le meilleur abonnement actif (ou une formule offerte).
  await syncPlan(userId);
  return userId;
}
