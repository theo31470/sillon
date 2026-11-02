'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { getSession, requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase/admin';
import { getListingByRef } from '@/lib/bourse';
import { BourseError, settleBoursePayment, startPurchase } from '@/lib/bourse-pay';

const recipientSchema = z.object({
  name: z.string().trim().min(2, 'Indiquez le nom du destinataire.').max(120),
  address1: z.string().trim().min(3, 'Indiquez l’adresse de livraison.').max(200),
  address2: z.string().trim().max(200).nullable(),
  city: z.string().trim().min(1, 'Indiquez la commune.').max(100),
  zip: z.string().trim().regex(/^\d{5}$/, 'Code postal à 5 chiffres.'),
  phone: z.string().trim().min(6, 'Indiquez un téléphone pour le transporteur.').max(30),
});

/** Crée la transaction et le paiement (réglé ensuite dans la page). */
export async function startBoursePurchase(input: {
  ref: string;
  mode: 'envoi' | 'main_propre';
  recipient: z.input<typeof recipientSchema> | null;
  expectedTotal: number;
  acceptedTerms: boolean;
}): Promise<{ ok: true; orderId: string; clientSecret: string } | { ok: false; error: string }> {
  const { session, profile } = await requireUser(`/app/acheter/${input.ref}`);
  if (!input.acceptedTerms) return { ok: false, error: 'Cochez la case des conditions de la bourse pour continuer.' };
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'inconnu';
  if (!rateLimit(`bourse-achat:${session.userId}`, 8, 10 * 60_000).ok || !rateLimit(`bourse-achat-ip:${ip}`, 15, 10 * 60_000).ok) return { ok: false, error: 'Trop de tentatives : patientez quelques minutes.' };
  const listing = await getListingByRef(String(input.ref));
  if (!listing) return { ok: false, error: 'Annonce introuvable.' };
  const mode = input.mode === 'envoi' ? 'envoi' : 'main_propre';
  let recipient = null;
  if (mode === 'envoi') {
    const parsed = recipientSchema.safeParse(input.recipient);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Adresse de livraison incomplète.' };
    recipient = parsed.data;
  }
  try {
    const r = await startPurchase({ buyerId: session.userId, buyerEmail: profile.email, customerId: profile.stripe_customer_id, listing, mode, recipient, expectedTotal: Math.round(Number(input.expectedTotal)) });
    return { ok: true, ...r };
  } catch (err) {
    if (err instanceof BourseError) return { ok: false, error: err.message };
    console.error('[bourse] achat', err);
    return { ok: false, error: 'Le paiement ne peut pas démarrer pour le moment. Réessayez dans un instant.' };
  }
}

/** Le paiement vient d'aboutir dans la page : la transaction est mise à jour aussitôt (le webhook sert de filet). */
export async function finishBoursePurchase(orderId: string) {
  const session = await getSession();
  if (!session || !/^[0-9a-f-]{36}$/i.test(orderId)) return { ok: false };
  const { data } = await createServiceClient().from('listing_orders').select('stripe_payment_intent, buyer_id').eq('id', orderId).maybeSingle();
  if (!data?.stripe_payment_intent || data.buyer_id !== session.userId) return { ok: false };
  try {
    await settleBoursePayment(data.stripe_payment_intent as string);
    return { ok: true };
  } catch (err) {
    console.error('[bourse] fin de paiement', orderId, err);
    return { ok: false };
  }
}
