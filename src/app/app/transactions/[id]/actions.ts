'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { BourseError, confirmHandover, confirmReceipt, markShipped, openDispute, sellerCancel } from '@/lib/bourse-pay';
import { CARRIERS } from '@/lib/bourse-shared';
import type { FormState } from '@/components/form-bits';

const id = z.string().uuid();

async function run(formData: FormData, key: string, fn: (orderId: string, userId: string) => Promise<void>, message: string): Promise<FormState> {
  const orderId = id.safeParse(formData.get('id'));
  if (!orderId.success) return { error: 'Transaction introuvable.' };
  const { session } = await requireUser(`/app/transactions/${orderId.data}`);
  if (!rateLimit(`bourse-${key}:${session.userId}`, 10, 10 * 60_000).ok) return { error: 'Trop de tentatives : patientez quelques minutes.' };
  try {
    await fn(orderId.data, session.userId);
  } catch (err) {
    if (err instanceof BourseError) return { error: err.message };
    console.error(`[bourse] ${key}`, orderId.data, err);
    return { error: 'L’opération n’a pas abouti. Réessayez dans un instant.' };
  }
  revalidatePath(`/app/transactions/${orderId.data}`);
  revalidatePath('/app/transactions');
  return { ok: true, message };
}

/** Le vendeur saisit le code que l'acheteur lui donne à la remise. */
export async function handoverAction(_prev: FormState, formData: FormData) {
  const code = String(formData.get('code') ?? '').replace(/\D/g, '');
  if (code.length !== 6) return { error: 'Le code fait 6 chiffres.' };
  // Peu d'essais : le code ne doit pas pouvoir être deviné.
  return run(formData, 'code', (o, u) => confirmHandover(o, u, code), 'Remise confirmée : le paiement vous est versé.');
}

export async function shippedAction(_prev: FormState, formData: FormData) {
  const carrier = String(formData.get('carrier') ?? '');
  const tracking = String(formData.get('tracking') ?? '').trim().slice(0, 60);
  if (!(CARRIERS as readonly string[]).includes(carrier)) return { error: 'Choisissez le transporteur.' };
  if (tracking.length < 4) return { error: 'Indiquez le numéro de suivi du colis.' };
  return run(formData, 'envoi', (o, u) => markShipped(o, u, carrier, tracking), 'Expédition enregistrée : l’acheteur est prévenu.');
}

export async function receiptAction(_prev: FormState, formData: FormData) {
  return run(formData, 'reception', (o, u) => confirmReceipt(o, u), 'Merci ! Le vendeur est payé, la vente est terminée.');
}

export async function cancelAction(_prev: FormState, formData: FormData) {
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 300);
  return run(formData, 'annulation', (o, u) => sellerCancel(o, u, reason), 'Vente annulée : l’acheteur est remboursé.');
}

export async function disputeAction(_prev: FormState, formData: FormData) {
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 10) return { error: 'Décrivez le problème en quelques mots (10 caractères au moins).' };
  return run(formData, 'litige', (o, u) => openDispute(o, u, reason), 'Problème signalé : l’argent est bloqué et notre équipe revient vers vous sous 48 h.');
}

const senderSchema = z.object({
  name: z.string().trim().min(3, 'Indiquez vos nom et prénom.').max(80),
  street: z.string().trim().min(4, 'Indiquez votre adresse (numéro et rue).').max(150),
  zip: z.string().trim().regex(/^\d{5}$/, 'Code postal à 5 chiffres.'),
  city: z.string().trim().min(1, 'Indiquez la commune.').max(80),
  phone: z
    .string()
    .trim()
    .refine((v) => /^(\+33|0033|0)[1-9](\d{2}){4}$/.test(v.replace(/[\s.-]/g, '')), 'Téléphone français à 10 chiffres (le transporteur vous prévient en cas de souci).'),
});

/** Le vendeur génère son bordereau prépayé. */
export async function labelAction(_prev: FormState, formData: FormData) {
  const sender = senderSchema.safeParse({
    name: formData.get('name'),
    street: formData.get('street'),
    zip: formData.get('zip'),
    city: formData.get('city'),
    phone: formData.get('phone'),
  });
  if (!sender.success) return { error: sender.error.issues[0]?.message ?? 'Adresse incomplète.' };
  const { createLabel } = await import('@/lib/bourse-pay');
  return run(formData, 'bordereau', async (o, u) => void (await createLabel(o, u, sender.data)), 'Bordereau créé : téléchargez-le, imprimez-le et collez-le sur le colis.');
}
