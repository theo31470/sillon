import 'server-only';
import { createServiceClient } from '@/lib/supabase/admin';
import { ACTIVE_STATUSES } from '@/lib/stripe';
import type { Plan } from '@/lib/types';

/**
 * Formule effective d'un membre : le meilleur abonnement Stripe encore actif,
 * sinon la formule Complet offerte par un admin (si elle court toujours),
 * sinon la formule gratuite. Appelée par le webhook Stripe, les actions admin
 * et l'expiration quotidienne des formules offertes.
 */
export async function syncPlan(userId: string): Promise<Plan> {
  const db = createServiceClient();
  const [{ data: subs }, { data: profile }] = await Promise.all([
    db.from('subscriptions').select('status, plan').eq('user_id', userId),
    db.from('profiles').select('comp_active, comp_until').eq('id', userId).maybeSingle(),
  ]);
  const active = (subs ?? []).filter((s) => ACTIVE_STATUSES.has(s.status));
  const compRunning = Boolean(profile?.comp_active && (!profile.comp_until || new Date(profile.comp_until) > new Date()));
  const plan: Plan = active.some((s) => s.plan === 'groupement') ? 'groupement' : active.length || compRunning ? 'complet' : 'free';
  const patch: Record<string, unknown> = { plan };
  // Une formule offerte arrivée à échéance est retirée.
  if (profile?.comp_active && !compRunning) patch.comp_active = false;
  await db.from('profiles').update(patch).eq('id', userId);
  return plan;
}

export const compExpired = (p: { comp_active: boolean; comp_until: string | null }) =>
  p.comp_active && Boolean(p.comp_until) && new Date(p.comp_until!) <= new Date();

/** Retire les formules offertes arrivées à échéance (tournée quotidienne). */
export async function expireComps() {
  const db = createServiceClient();
  const { data } = await db.from('profiles').select('id').eq('comp_active', true).lte('comp_until', new Date().toISOString());
  for (const p of data ?? []) await syncPlan(p.id);
  return (data ?? []).length;
}

/** Note la dernière activité d'un membre (au plus une écriture par heure). */
export async function touchLastSeen(userId: string, lastSeenAt: string | null) {
  if (lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 3600_000) return;
  try {
    await createServiceClient().from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userId);
  } catch (err) {
    console.error('[activité]', err);
  }
}
