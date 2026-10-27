'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { hasRecentMfa, requireAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { env } from '@/lib/env';
import { CONTACT_STATUSES, type ContactMessage, type ContactReply, type ContactStatus } from '@/lib/contact';
import { contactReplyEmail } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';
import type { FormState } from '@/components/form-bits';

async function load(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return null;
  const { data } = await createServiceClient().from('contact_messages').select('*').eq('id', id.data).single();
  return (data as ContactMessage | null) ?? null;
}

function refresh(id: string) {
  revalidatePath('/admin/messages');
  revalidatePath(`/admin/messages/${id}`);
  revalidatePath('/admin', 'layout');
}

export async function setMessageStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/messages');
  const msg = await load(formData);
  const status = z.enum(Object.keys(CONTACT_STATUSES) as [ContactStatus, ...ContactStatus[]]).safeParse(formData.get('status'));
  if (!msg || !status.success) return { error: 'Requête invalide.' };
  const done = status.data === 'traite' || status.data === 'archive';
  const { error } = await createServiceClient()
    .from('contact_messages')
    .update({ status: status.data, handled_at: done ? new Date().toISOString() : null, handled_by: done ? session.userId : null })
    .eq('id', msg.id);
  if (error) return { error: 'Mise à jour impossible.' };
  refresh(msg.id);
  return { ok: true, message: `Message marqué « ${CONTACT_STATUSES[status.data]} ».` };
}

export async function saveMessageNote(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin('/admin/messages');
  const msg = await load(formData);
  if (!msg) return { error: 'Message introuvable.' };
  const { error } = await createServiceClient().from('contact_messages').update({ admin_note: String(formData.get('note') ?? '').slice(0, 5000) }).eq('id', msg.id);
  if (error) return { error: 'Enregistrement impossible.' };
  refresh(msg.id);
  return { ok: true, message: 'Note enregistrée.' };
}

const replySchema = z.object({
  subject: z.string().trim().min(3, 'Objet trop court.').max(150),
  body: z.string().trim().min(5, 'Réponse trop courte.').max(10_000),
});

export async function replyToMessage(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/messages');
  const msg = await load(formData);
  if (!msg) return { error: 'Message introuvable.' };
  const parsed = replySchema.safeParse({ subject: formData.get('subject'), body: formData.get('body') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const r = await sendEmail({
    to: msg.email,
    email: contactReplyEmail({ name: msg.name, subject: parsed.data.subject, bodyMd: parsed.data.body, original: msg.message }, env.siteUrl()),
    kind: 'contact',
    template: 'contact_reponse',
    userId: msg.user_id,
  });
  if (!r.ok) return { error: `Envoi impossible : ${r.error}` };

  const reply: ContactReply = { at: new Date().toISOString(), by: session.email, subject: parsed.data.subject, body: parsed.data.body };
  const markDone = formData.get('mark_done') === 'on';
  await createServiceClient()
    .from('contact_messages')
    .update({
      replies: [...(msg.replies ?? []), reply],
      status: markDone ? 'traite' : 'en_cours',
      handled_at: markDone ? new Date().toISOString() : msg.handled_at,
      handled_by: markDone ? session.userId : null,
    })
    .eq('id', msg.id);
  await logAudit(session, 'contact.reponse_envoyee', { type: 'contact_message', id: msg.id }, { objet: parsed.data.subject });
  refresh(msg.id);
  return { ok: true, message: `Réponse envoyée à ${msg.email}.` };
}

export async function deleteMessage(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/messages');
  if (!hasRecentMfa(session)) return { error: 'Action sensible : validez à nouveau votre code de double authentification, puis recommencez.' };
  const msg = await load(formData);
  if (!msg) return { error: 'Message introuvable.' };
  const { error } = await createServiceClient().from('contact_messages').delete().eq('id', msg.id);
  if (error) return { error: 'Suppression impossible.' };
  await logAudit(session, 'contact.message_supprime', { type: 'contact_message', id: msg.id }, { email: msg.email });
  revalidatePath('/admin/messages');
  revalidatePath('/admin', 'layout');
  redirect('/admin/messages?supprime=1');
}
