import 'server-only';
import { createServiceClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { COMPLET_PRICES, FREE_MACHINE_LIMIT, TRIAL_DAYS } from '@/lib/plans';
import { emailSettings, preferencesUrl, sendEmail } from '@/lib/email/send';
import { nudgeEmail, type NudgeKind } from '@/lib/email/templates';

/**
 * Relances des comptes gratuits : chacune n'est envoyée qu'une fois par membre,
 * seulement si les annonces sont activées sur son compte (lien de désinscription
 * en un clic dans chaque e-mail).
 */

type Member = { id: string; email: string; full_name: string; email_token: string; plan: string; comp_active: boolean; email_news: boolean; suspended: boolean };

const INACTIVE_DAYS = 14;
// Au-delà, le compte est sans doute abandonné : on n'insiste pas.
const INACTIVE_MAX_DAYS = 60;

async function sendNudge(m: Member, kind: NudgeKind, machines: number) {
  if (!m.email || m.suspended || !m.email_news || m.plan !== 'free' || m.comp_active) return false;
  const db = createServiceClient();
  // Réservée avant l'envoi : jamais deux fois la même relance.
  const { error } = await db.from('member_nudges').insert({ user_id: m.id, kind });
  if (error) return false;
  const email = nudgeEmail(
    kind,
    { name: m.full_name, machines, limit: FREE_MACHINE_LIMIT, priceLabel: `${COMPLET_PRICES.mensuel.label} par mois`, trialDays: TRIAL_DAYS, preferencesUrl: preferencesUrl(m.email_token) },
    env.siteUrl(),
  );
  const res = await sendEmail(
    { to: m.email, email, kind: 'annonce', template: kind === 'limite_machines' ? 'relance_limite' : 'relance_inactif', userId: m.id, unsubscribe: { token: m.email_token, list: 'annonces' } },
    { idempotencyKey: `relance-${kind}-${m.id}` },
  );
  return res.ok;
}

const MEMBER_COLUMNS = 'id, email, full_name, email_token, plan, comp_active, email_news, suspended';

/** Après l'ajout d'une machine (ou un ajout refusé) : prévient une fois qu'il atteint la limite gratuite. */
export async function nudgeMachineLimit(userId: string) {
  if (!emailSettings().apiKeySet) return;
  const db = createServiceClient();
  const [{ data: m }, { count }] = await Promise.all([
    db.from('profiles').select(MEMBER_COLUMNS).eq('id', userId).maybeSingle(),
    db.from('machines').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  if (!m || (count ?? 0) < FREE_MACHINE_LIMIT) return;
  await sendNudge(m as Member, 'limite_machines', count ?? 0);
}

/** Tournée quotidienne : membres gratuits sans visite depuis 14 jours (une seule relance chacun). */
export async function runInactiveNudges(): Promise<number> {
  if (!emailSettings().apiKeySet) return 0;
  const db = createServiceClient();
  const now = Date.now();
  const since = new Date(now - INACTIVE_DAYS * 86_400_000).toISOString();
  const until = new Date(now - INACTIVE_MAX_DAYS * 86_400_000).toISOString();
  const { data } = await db
    .from('profiles')
    .select(`${MEMBER_COLUMNS}, last_seen_at, created_at`)
    .eq('plan', 'free')
    .eq('comp_active', false)
    .eq('email_news', true)
    .eq('suspended', false)
    .eq('role', 'member')
    .lt('created_at', since)
    .or(`and(last_seen_at.lt.${since},last_seen_at.gt.${until}),and(last_seen_at.is.null,created_at.gt.${until})`)
    .limit(200);
  const list = (data ?? []) as Member[];
  if (!list.length) return 0;
  const { data: done } = await db.from('member_nudges').select('user_id').eq('kind', 'inactif').in('user_id', list.map((m) => m.id));
  const already = new Set((done ?? []).map((r) => r.user_id as string));
  let sent = 0;
  for (const m of list) {
    if (already.has(m.id)) continue;
    const { count } = await db.from('machines').select('id', { count: 'exact', head: true }).eq('user_id', m.id);
    if (await sendNudge(m, 'inactif', count ?? 0)) sent++;
  }
  return sent;
}
