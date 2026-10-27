'use server';

import { createHash } from 'node:crypto';
import { after } from 'next/server';
import { z } from 'zod';
import { clientIp } from '@/lib/audit';
import { getProfile } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { CONTACT_TOPICS, type ContactTopic } from '@/lib/contact';
import { contactAckEmail, contactAlertEmail } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';

export type ContactState = { ok?: boolean; error?: string; fields?: Record<string, string> } | undefined;

const schema = z.object({
  name: z.string().trim().min(2, 'Indiquez votre nom.').max(120),
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.').max(254),
  phone: z.string().trim().max(40).regex(/^[\d\s+().-]*$/, 'Numéro de téléphone invalide.'),
  farm_name: z.string().trim().max(120),
  topic: z.enum(Object.keys(CONTACT_TOPICS) as [ContactTopic, ...ContactTopic[]]),
  message: z.string().trim().min(10, 'Votre message est un peu court (10 caractères minimum).').max(5000, 'Message trop long (5 000 caractères au plus).'),
  consent: z.literal('on', { error: 'Cochez la case pour accepter que nous utilisions ces informations pour vous répondre.' }),
});

export async function sendContactMessage(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const raw = Object.fromEntries(['name', 'email', 'phone', 'farm_name', 'topic', 'message'].map((k) => [k, String(formData.get(k) ?? '')]));

  // Anti-robots : champ piège invisible, et formulaire rempli en moins de 3 secondes.
  const startedAt = Number(formData.get('t'));
  if (String(formData.get('website') ?? '') !== '' || !startedAt || Date.now() - startedAt < 3000) {
    return { ok: true }; // On ne dit rien au robot.
  }

  const parsed = schema.safeParse({ ...raw, consent: formData.get('consent') });
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: raw };
  const data = parsed.data;

  const ip = await clientIp();
  if (!rateLimit(`contact:${ip}`, 5, 60 * 60_000).ok) return { error: 'Trop de messages envoyés. Réessayez dans une heure.', fields: raw };

  const db = createServiceClient();
  // Limites partagées entre les serveurs : 3 messages par heure et par adresse, 60 par heure en tout.
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const [{ count: byEmail }, { count: total }] = await Promise.all([
    db.from('contact_messages').select('id', { count: 'exact', head: true }).ilike('email', data.email).gte('created_at', hourAgo),
    db.from('contact_messages').select('id', { count: 'exact', head: true }).gte('created_at', hourAgo),
  ]);
  if ((byEmail ?? 0) >= 3 || (total ?? 0) >= 60) return { error: 'Trop de messages en ce moment. Réessayez un peu plus tard.', fields: raw };

  const profile = await getProfile();
  const { data: row, error } = await db
    .from('contact_messages')
    .insert({
      name: data.name,
      email: data.email,
      phone: data.phone,
      farm_name: data.farm_name,
      topic: data.topic,
      message: data.message,
      user_id: profile?.id ?? null,
      ip_hash: createHash('sha256').update(`contact|${ip}`).digest('hex').slice(0, 32),
    })
    .select('id')
    .single();
  if (error || !row) {
    console.error('[contact]', error?.message);
    return { error: 'L’envoi n’a pas abouti. Réessayez dans un instant, ou écrivez-nous directement par e-mail.', fields: raw };
  }

  // E-mails après la réponse : l'internaute n'attend pas.
  after(async () => {
    const site = env.siteUrl().replace(/\/$/, '');
    const topic = CONTACT_TOPICS[data.topic];
    await sendEmail({
      to: data.email,
      email: contactAckEmail({ name: data.name, topic, message: data.message }, site),
      kind: 'contact',
      template: 'contact_accuse',
      userId: profile?.id ?? null,
    });
    const { data: admins } = await db.from('profiles').select('id, email').eq('role', 'admin').eq('suspended', false);
    for (const a of admins ?? []) {
      await sendEmail({
        to: a.email,
        email: contactAlertEmail({ name: data.name, email: data.email, topic, message: data.message, url: `${site}/admin/messages/${row.id}`, member: Boolean(profile) }, site),
        kind: 'contact',
        template: 'contact_alerte',
        userId: a.id,
        replyTo: data.email,
      });
    }
  });

  return { ok: true };
}
