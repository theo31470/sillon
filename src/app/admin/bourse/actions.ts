'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createServiceClient } from '@/lib/supabase/admin';
import type { FormState } from '@/components/form-bits';

/** Retire une annonce de la bourse (motif montré au vendeur). */
export async function moderateListing(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/bourse');
  const id = z.string().uuid().safeParse(formData.get('id'));
  const note = String(formData.get('note') ?? '').trim().slice(0, 300);
  if (!id.success) return { error: 'Annonce introuvable.' };
  const db = createServiceClient();
  await db.from('listings').update({ status: 'moderee', moderation_note: note || 'Annonce contraire aux règles de la bourse.', updated_at: new Date().toISOString() }).eq('id', id.data);
  await db.from('listing_reports').update({ handled_at: new Date().toISOString() }).eq('listing_id', id.data).is('handled_at', null);
  await logAudit(session, 'bourse.moderation', { type: 'listing', id: id.data }, { note });
  revalidatePath('/admin/bourse');
  revalidatePath('/bourse');
  return { ok: true, message: 'Annonce retirée.' };
}

/** Signalement examiné, annonce laissée en ligne. */
export async function dismissReports(formData: FormData) {
  const { session } = await requireAdmin('/admin/bourse');
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  await createServiceClient().from('listing_reports').update({ handled_at: new Date().toISOString() }).eq('listing_id', id.data).is('handled_at', null);
  await logAudit(session, 'bourse.signalement_classe', { type: 'listing', id: id.data });
  revalidatePath('/admin/bourse');
}

/** Remet en ligne une annonce retirée par erreur. */
export async function restoreListing(formData: FormData) {
  const { session } = await requireAdmin('/admin/bourse');
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  await createServiceClient().from('listings').update({ status: 'en_ligne', moderation_note: null, updated_at: new Date().toISOString() }).eq('id', id.data).eq('status', 'moderee');
  await logAudit(session, 'bourse.remise_en_ligne', { type: 'listing', id: id.data });
  revalidatePath('/admin/bourse');
  revalidatePath('/bourse');
}

/** Litige ou blocage : l'équipe rembourse l'acheteur ou paie le vendeur. */
export async function resolveOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/bourse');
  const id = z.string().uuid().safeParse(formData.get('id'));
  const decision = formData.get('decision') === 'payer' ? 'payer' : formData.get('decision') === 'rembourser' ? 'rembourser' : null;
  const note = String(formData.get('note') ?? '').trim().slice(0, 300);
  if (!id.success || !decision) return { error: 'Décision invalide.' };
  const { adminResolve, BourseError } = await import('@/lib/bourse-pay');
  try {
    await adminResolve(id.data, decision, note);
  } catch (err) {
    if (err instanceof BourseError) return { error: err.message };
    console.error('[bourse] décision admin', id.data, err);
    return { error: 'Stripe n’a pas accepté l’opération : voir les journaux.' };
  }
  await logAudit(session, `bourse.transaction_${decision}`, { type: 'listing_order', id: id.data }, { note });
  revalidatePath('/admin/bourse');
  return { ok: true, message: decision === 'payer' ? 'Vendeur payé.' : 'Acheteur remboursé.' };
}

/** Diagnostic Boxtal : clés, cotation d'essai, points relais, notifications. */
export async function testBoxtal(): Promise<FormState> {
  await requireAdmin('/admin/bourse');
  const bx = await import('@/lib/boxtal');
  if (!bx.boxtalConfigured()) return { error: 'Clés BOXTAL_ACCESS_KEY et BOXTAL_SECRET_KEY absentes dans Vercel.' };
  const lines: string[] = [`Environnement : ${bx.boxtalSandbox() ? 'test (sandbox)' : 'production'}.`];
  try {
    const cats = await bx.contentCategories();
    const ours = cats.find((c) => c.id === 'content:v1:50150');
    lines.push(`Connexion OK (${cats.length} catégories ; « ${ours?.label ?? 'pièces de rechange'} »).`);
  } catch (err) {
    return { error: `Connexion refusée : ${err instanceof Error ? err.message : String(err)}` };
  }
  try {
    const offers = await bx.quoteShipping({ fromZip: '35000', fromCity: 'Rennes', toZip: '34740', toCity: 'Vendargues', weightKg: 5, size: 'moyen', category: 'pieces', valueCents: 15000 });
    lines.push(offers.length ? `Cotation 5 kg Rennes → Vendargues : ${offers.map((o) => `${o.carrier} ${o.delivery === 'HOME' ? 'domicile' : 'relais'} ${(o.price_cents / 100).toFixed(2).replace('.', ',')} €`).join(' · ')}.` : 'Cotation : aucune offre renvoyée.');
    const relay = offers.find((o) => o.delivery === 'PICKUP_POINT');
    if (relay) {
      const pts = await bx.parcelPoints(relay.code, '34740', 'Vendargues', null);
      lines.push(`Points relais ${relay.carrier} près de Vendargues : ${pts.length}${pts[0] ? ` (le plus proche : ${pts[0].name})` : ''}.`);
    }
  } catch (err) {
    lines.push(`Cotation en échec : ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const subs = await bx.subscriptions();
    const url = `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')}/api/boxtal`;
    const mine = subs.filter((s) => s.callbackUrl === url).map((s) => s.eventType);
    lines.push(`Notifications vers le site : ${mine.length ? mine.join(', ') : 'aucune (cliquez sur « Activer les notifications »)'}.`);
  } catch (err) {
    lines.push(`Notifications : lecture impossible (${err instanceof Error ? err.message : String(err)}).`);
  }
  return { ok: true, message: lines.join('\n') };
}

/** Abonne le site aux notifications de suivi et de bordereau. */
export async function enableBoxtalWebhooks(): Promise<FormState> {
  const { session } = await requireAdmin('/admin/bourse');
  const bx = await import('@/lib/boxtal');
  if (!bx.boxtalConfigured()) return { error: 'Clés Boxtal absentes.' };
  const url = `${(process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')}/api/boxtal`;
  if (!url.startsWith('https://')) return { error: 'Adresse du site inconnue (NEXT_PUBLIC_SITE_URL).' };
  try {
    const subs = await bx.subscriptions();
    // Les anciens abonnements vers ce site sont remplacés (le secret est recalculé à chaque fois).
    for (const s of subs.filter((s) => s.callbackUrl === url)) await bx.unsubscribe(s.id);
    await bx.subscribe('TRACKING_CHANGED', url);
    await bx.subscribe('DOCUMENT_CREATED', url);
  } catch (err) {
    return { error: `Boxtal a refusé : ${err instanceof Error ? err.message : String(err)}` };
  }
  await logAudit(session, 'bourse.boxtal_notifications', { type: 'boxtal', id: 'webhooks' });
  return { ok: true, message: 'Notifications activées : le suivi des colis se met à jour en direct.' };
}
