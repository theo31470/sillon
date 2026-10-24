import 'server-only';
import Stripe from 'stripe';
import { env } from '@/lib/env';

let instance: Stripe | null = null;

/** Client Stripe (créé à la demande pour que le build fonctionne sans clé). */
export function stripe() {
  instance ??= new Stripe(env.stripeSecretKey(), {
    appInfo: { name: 'Sillon' },
  });
  return instance;
}

/** Statuts Stripe qui donnent accès à la formule payante. */
export const ACTIVE_STATUSES = new Set(['trialing', 'active', 'past_due']);
