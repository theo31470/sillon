import 'server-only';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { upsertSubscription } from '@/lib/stripe-sync';
import { periodOfPrice, priceOfPeriod } from '@/lib/subscription-view';
import type { BillingPeriod } from '@/lib/plans';

/**
 * Passage mensuel ↔ annuel d'un abonnement Stripe (utilisé par le membre et par l'admin).
 * Pendant l'essai : immédiat, sans paiement. Sinon : à la prochaine échéance, via un
 * calendrier d'abonnement Stripe (pas de double paiement). Revenir à la formule
 * actuelle annule le changement prévu. Renvoie le résultat, ou lève une erreur.
 */
export async function applyPeriodChange(sub: Stripe.Subscription, target: BillingPeriod, userId: string): Promise<{ result: 'deja' | 'essai' | 'programme' | 'annule' }> {
  const item = sub.items.data[0];
  if (!item) throw new Error('Abonnement sans formule.');
  if (target === 'annuel' && priceOfPeriod('annuel') === priceOfPeriod('mensuel')) throw new Error('La formule annuelle n’est pas encore proposée.');
  if (sub.cancel_at_period_end || sub.cancel_at) throw new Error('Annulez d’abord la résiliation pour changer de formule.');
  const price = priceOfPeriod(target);

  if (sub.status === 'trialing') {
    if (periodOfPrice(item.price.id) === target) return { result: 'deja' };
    const updated = await stripe().subscriptions.update(sub.id, { items: [{ id: item.id, price }], proration_behavior: 'none', metadata: { ...sub.metadata, periode: target } });
    await upsertSubscription(updated, userId);
    return { result: 'essai' };
  }

  const scheduleId = typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id;
  if (periodOfPrice(item.price.id) === target) {
    if (scheduleId) await stripe().subscriptionSchedules.release(scheduleId);
    return { result: scheduleId ? 'annule' : 'deja' };
  }
  const schedule = scheduleId ? await stripe().subscriptionSchedules.retrieve(scheduleId) : await stripe().subscriptionSchedules.create({ from_subscription: sub.id });
  const current = schedule.phases[schedule.phases.length - 1] ?? schedule.phases[0];
  await stripe().subscriptionSchedules.update(schedule.id, {
    end_behavior: 'release',
    phases: [
      { items: [{ price: item.price.id, quantity: item.quantity ?? 1 }], start_date: current.start_date, end_date: item.current_period_end, proration_behavior: 'none' },
      {
        items: [{ price, quantity: 1 }],
        duration: { interval: target === 'annuel' ? 'year' : 'month', interval_count: 1 },
        proration_behavior: 'none',
        metadata: { ...sub.metadata, periode: target },
      },
    ],
  });
  return { result: 'programme' };
}
