'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { publicName } from '@/lib/bourse';
import { REPORT_REASONS, type ReportReason } from '@/lib/bourse-shared';
import { sendEmail } from '@/lib/email/send';
import { listingMessageEmail } from '@/lib/email/templates';
import type { FormState } from '@/components/form-bits';

const body = z.string().trim().min(1, 'Écrivez votre message.').max(2000, 'Message trop long (2 000 caractères).');

type Conv = { id: string; listing_id: string; buyer_id: string; seller_id: string; last_message_at: string; buyer_read_at: string | null; seller_read_at: string | null };

/** Ajoute un message et prévient le destinataire par e-mail s'il avait déjà tout lu. */
async function post(conv: Conv, senderId: string, text: string) {
  const db = createServiceClient();
  const now = new Date().toISOString();
  const toBuyer = senderId === conv.seller_id;
  const recipientId = toBuyer ? conv.buyer_id : conv.seller_id;
  const recipientRead = toBuyer ? conv.buyer_read_at : conv.seller_read_at;
  // Premier message non lu : un e-mail. Les suivants attendent que le destinataire passe sur le site.
  const { count: before } = await db.from('listing_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', conv.id);
  const notify = recipientRead ? recipientRead >= conv.last_message_at : !before;
  const { error } = await db.from('listing_messages').insert({ conversation_id: conv.id, sender_id: senderId, body: text });
  if (error) throw new Error(error.message);
  await db
    .from('listing_conversations')
    .update({ last_message_at: now, ...(toBuyer ? { seller_read_at: now } : { buyer_read_at: now }) })
    .eq('id', conv.id);
  if (!notify) return;
  try {
    const [{ data: sender }, { data: recipient }, { data: listing }] = await Promise.all([
      db.from('profiles').select('full_name').eq('id', senderId).maybeSingle(),
      db.from('profiles').select('id, email, full_name, suspended').eq('id', recipientId).maybeSingle(),
      db.from('listings').select('title').eq('id', conv.listing_id).maybeSingle(),
    ]);
    if (!recipient?.email || recipient.suspended) return;
    await sendEmail(
      {
        to: recipient.email,
        email: listingMessageEmail(
          {
            name: recipient.full_name,
            from: publicName(sender?.full_name),
            listingTitle: listing?.title ?? 'votre annonce',
            preview: text,
            url: `${env.siteUrl().replace(/\/$/, '')}/app/messages/${conv.id}`,
            seller: !toBuyer,
          },
          env.siteUrl(),
        ),
        kind: 'message',
        template: 'bourse_message',
        userId: recipient.id,
      },
      { idempotencyKey: `bourse-${conv.id}-${now}` },
    );
  } catch (err) {
    console.error('[bourse] e-mail de message', err);
  }
}

function antiSpam(userId: string) {
  return rateLimit(`bourse-msg:${userId}`, 20, 10 * 60_000).ok && rateLimit(`bourse-msg-jour:${userId}`, 150, 24 * 3600_000).ok;
}

/** Premier contact avec le vendeur depuis une annonce. */
export async function contactSeller(_prev: FormState, formData: FormData): Promise<FormState> {
  const listingId = z.string().uuid().safeParse(formData.get('listing_id'));
  const ref = String(formData.get('ref') ?? '');
  const { session } = await requireUser(`/bourse`);
  if (!listingId.success) return { error: 'Annonce introuvable.' };
  const text = body.safeParse(formData.get('body'));
  if (!text.success) return { error: text.error.issues[0].message };
  if (!antiSpam(session.userId)) return { error: 'Vous avez envoyé beaucoup de messages : patientez un peu.' };
  const db = createServiceClient();
  const { data: listing } = await db.from('listings').select('id, seller_id, status').eq('id', listingId.data).maybeSingle();
  if (!listing || !['en_ligne', 'reservee'].includes(listing.status as string)) return { error: 'Cette annonce n’est plus disponible.' };
  if (listing.seller_id === session.userId) return { error: 'C’est votre propre annonce.' };
  const { data: me } = await db.from('profiles').select('suspended, is_demo').eq('id', session.userId).maybeSingle();
  if (!me || me.suspended || me.is_demo) return { error: 'Votre compte ne peut pas envoyer de messages.' };

  let { data: conv } = await db.from('listing_conversations').select('*').eq('listing_id', listing.id).eq('buyer_id', session.userId).maybeSingle();
  if (!conv) {
    const created = await db
      .from('listing_conversations')
      .insert({ listing_id: listing.id, buyer_id: session.userId, seller_id: listing.seller_id, buyer_read_at: new Date().toISOString() })
      .select('*')
      .single();
    conv = created.data;
  }
  if (!conv) return { error: 'Envoi impossible pour le moment.' };
  try {
    await post(conv as Conv, session.userId, text.data);
  } catch {
    return { error: 'Envoi impossible pour le moment.' };
  }
  revalidatePath('/app/messages');
  redirect(`/app/messages/${conv.id}?depuis=${ref}`);
}

/** Réponse dans une conversation existante. */
export async function replyMessage(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireUser('/app/messages');
  const id = z.string().uuid().safeParse(formData.get('conversation_id'));
  const text = body.safeParse(formData.get('body'));
  if (!id.success) return { error: 'Conversation introuvable.' };
  if (!text.success) return { error: text.error.issues[0].message };
  if (!antiSpam(session.userId)) return { error: 'Vous avez envoyé beaucoup de messages : patientez un peu.' };
  // Lecture avec les droits du membre : seules les deux parties voient la conversation.
  const { data: conv } = await (await createClient()).from('listing_conversations').select('*').eq('id', id.data).maybeSingle();
  if (!conv || (conv.buyer_id !== session.userId && conv.seller_id !== session.userId)) return { error: 'Conversation introuvable.' };
  try {
    await post(conv as Conv, session.userId, text.data);
  } catch {
    return { error: 'Envoi impossible pour le moment.' };
  }
  revalidatePath(`/app/messages/${id.data}`);
  return { ok: true };
}

/** Favori ajouté ou retiré. */
export async function toggleFavorite(listingId: string, on: boolean): Promise<{ ok: boolean }> {
  const { session } = await requireUser('/bourse');
  if (!z.string().uuid().safeParse(listingId).success) return { ok: false };
  const supabase = await createClient();
  if (on) await supabase.from('listing_favorites').upsert({ user_id: session.userId, listing_id: listingId });
  else await supabase.from('listing_favorites').delete().eq('user_id', session.userId).eq('listing_id', listingId);
  return { ok: true };
}

/** Signalement d'une annonce à la modération. */
export async function reportListing(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireUser('/bourse');
  const id = z.string().uuid().safeParse(formData.get('listing_id'));
  const reason = z.enum(Object.keys(REPORT_REASONS) as [ReportReason, ...ReportReason[]]).safeParse(formData.get('reason'));
  if (!id.success || !reason.success) return { error: 'Choisissez une raison.' };
  if (!rateLimit(`bourse-signal:${session.userId}`, 10, 3600_000).ok) return { error: 'Trop de signalements : patientez un peu.' };
  const details = String(formData.get('details') ?? '').trim().slice(0, 1000);
  await createServiceClient().from('listing_reports').insert({ listing_id: id.data, reporter_id: session.userId, reason: reason.data, details });
  return { ok: true, message: 'Merci, l’annonce a été signalée à la modération.' };
}
