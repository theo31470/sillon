import 'server-only';
import { createServiceClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { campaignEmail } from '@/lib/email/templates';
import { preferencesUrl, sendMany, type OutgoingEmail } from '@/lib/email/send';

export type Audience = 'tous' | 'gratuits' | 'payants';
export const AUDIENCES: Record<Audience, string> = {
  tous: 'Tous les membres',
  gratuits: 'Formule gratuite',
  payants: 'Abonnés payants',
};

type Recipient = { id: string; email: string; full_name: string; email_token: string };

/** Membres qui recevront une annonce : actifs, avec les « nouveautés » acceptées. */
function recipientsQuery(audience: Audience) {
  let q = createServiceClient()
    .from('profiles')
    .select('id, email, full_name, email_token', { count: 'exact' })
    .eq('email_news', true)
    .eq('suspended', false)
    .neq('email', '');
  if (audience === 'gratuits') q = q.eq('plan', 'free');
  if (audience === 'payants') q = q.neq('plan', 'free');
  return q;
}

export async function audienceCounts(): Promise<Record<Audience, number>> {
  const entries = await Promise.all(
    (Object.keys(AUDIENCES) as Audience[]).map(async (a) => {
      const { count } = await recipientsQuery(a).range(0, 0);
      return [a, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<Audience, number>;
}

/** Envoie une campagne déjà enregistrée (appelé en arrière-plan). */
export async function deliverCampaign(campaignId: string) {
  const db = createServiceClient();
  const { data: c } = await db.from('email_campaigns').select('*').eq('id', campaignId).single();
  if (!c) return;
  const site = env.siteUrl();
  let sent = 0;
  let failed = 0;
  let recipients = 0;
  try {
    for (let from = 0; ; from += 500) {
      const { data, error } = await recipientsQuery(c.audience as Audience).order('created_at').range(from, from + 499);
      if (error) throw new Error(error.message);
      const list = (data ?? []) as Recipient[];
      if (!list.length) break;
      recipients += list.length;
      const messages: OutgoingEmail[] = list.map((r) => ({
        to: r.email,
        email: campaignEmail({ subject: c.subject, bodyMd: c.body_md, name: r.full_name, preferencesUrl: preferencesUrl(r.email_token) }, site),
        kind: 'annonce',
        template: 'annonce',
        userId: r.id,
        campaignId,
        unsubscribe: { token: r.email_token, list: 'annonces' },
      }));
      const res = await sendMany(messages, { idempotencyPrefix: `campagne-${campaignId}-${from}` });
      sent += res.sent;
      failed += res.failed;
      await db.from('email_campaigns').update({ recipients, sent, failed }).eq('id', campaignId);
      if (list.length < 500) break;
    }
    await db
      .from('email_campaigns')
      .update({ recipients, sent, failed, status: sent === 0 && failed > 0 ? 'failed' : 'sent', finished_at: new Date().toISOString() })
      .eq('id', campaignId);
  } catch (err) {
    console.error('[campagne]', err);
    await db.from('email_campaigns').update({ recipients, sent, failed, status: 'failed', finished_at: new Date().toISOString() }).eq('id', campaignId);
  }
}
