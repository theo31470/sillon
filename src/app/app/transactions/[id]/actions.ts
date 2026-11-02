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
