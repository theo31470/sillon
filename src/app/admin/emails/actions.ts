'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { env } from '@/lib/env';
import { campaignEmail } from '@/lib/email/templates';
import { emailSettings, preferencesUrl, sendEmail } from '@/lib/email/send';
import { audienceCounts, deliverCampaign, type Audience } from '@/lib/email/campaigns';
import { runReminders } from '@/lib/email/reminders';
import type { FormState } from '@/components/form-bits';

const campaignSchema = z.object({
  subject: z.string().trim().min(3, 'Objet trop court').max(150, 'Objet trop long (150 caractères maximum)'),
  body: z.string().trim().min(10, 'Message trop court').max(20000, 'Message trop long'),
  audience: z.enum(['tous', 'gratuits', 'payants']),
});

const parse = (formData: FormData) =>
  campaignSchema.safeParse({ subject: formData.get('subject'), body: formData.get('body'), audience: formData.get('audience') });

const NOT_READY = 'Service d’envoi non configuré : ajoutez la clé RESEND_API_KEY dans Vercel (voir l’encadré « Configuration »).';

/** Envoie l'annonce à l'administrateur seul, pour vérifier le rendu dans une vraie boîte mail. */
export async function sendTestCampaign(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, profile } = await requireAdmin('/admin/emails');
  if (!emailSettings().apiKeySet) return { error: NOT_READY };
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const r = await sendEmail({
    to: profile.email,
    email: campaignEmail(
      { subject: `[Test] ${parsed.data.subject}`, bodyMd: parsed.data.body, name: profile.full_name, preferencesUrl: preferencesUrl(profile.email_token) },
      env.siteUrl(),
    ),
    kind: 'test',
    template: 'annonce',
    userId: session.userId,
  });
  revalidatePath('/admin/emails');
  return r.ok ? { ok: true, message: `Test envoyé à ${profile.email}.` } : { error: r.error };
}

export async function sendCampaign(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/emails');
  if (!emailSettings().apiKeySet) return { error: NOT_READY };
  if (emailSettings().testSender) return { error: 'L’adresse d’envoi est encore celle d’essai de Resend : elle ne peut écrire qu’à vous. Vérifiez d’abord votre nom de domaine.' };
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (formData.get('confirm') !== 'on') return { error: 'Cochez la case de confirmation avant l’envoi.' };

  const counts = await audienceCounts();
  const total = counts[parsed.data.audience as Audience];
  if (total === 0) return { error: 'Aucun membre ne correspond à ce public (ou tous ont refusé les annonces).' };

  const db = createServiceClient();
  const recent = await db
    .from('email_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sending')
    .gte('created_at', new Date(Date.now() - 15 * 60_000).toISOString());
  if ((recent.count ?? 0) > 0) return { error: 'Une annonce est déjà en cours d’envoi. Attendez qu’elle se termine.' };

  const { data: campaign, error } = await db
    .from('email_campaigns')
    .insert({ subject: parsed.data.subject, body_md: parsed.data.body, audience: parsed.data.audience, recipients: total, created_by: session.userId })
    .select('id')
    .single();
  if (error || !campaign) return { error: 'Enregistrement de l’annonce impossible.' };

  await logAudit(session, 'email.annonce_envoyee', { type: 'email_campaign', id: campaign.id }, { objet: parsed.data.subject, public: parsed.data.audience, destinataires: total });
  // L'envoi continue après la réponse (par paquets de 100).
  after(() => deliverCampaign(campaign.id));
  revalidatePath('/admin/emails');
  return { ok: true, message: `Envoi lancé à ${total} membre${total > 1 ? 's' : ''}. Suivez l’avancement dans l’historique ci-dessous.` };
}

export async function runRemindersNow(): Promise<FormState> {
  const { session } = await requireAdmin('/admin/emails');
  if (!emailSettings().apiKeySet) return { error: NOT_READY };
  const r = await runReminders({ force: true });
  await logAudit(session, 'email.rappels_lances', undefined, { ...r });
  revalidatePath('/admin/emails');
  if (r.skipped) return { error: r.skipped };
  return {
    ok: true,
    message:
      r.emails === 0 && r.failed === 0
        ? `${r.members} membre${r.members > 1 ? 's' : ''} vérifié${r.members > 1 ? 's' : ''} : aucun nouveau rappel à envoyer.`
        : `${r.emails} rappel${r.emails > 1 ? 's' : ''} envoyé${r.emails > 1 ? 's' : ''}${r.failed ? `, ${r.failed} en échec` : ''}.`,
  };
}
