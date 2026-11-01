'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { env } from '@/lib/env';
import { forgetCatalogFailure, registerWebhook, SHOP_CACHE_TAG } from '@/lib/printful';
import { submitToPrintful, syncShopOrder } from '@/lib/shop';
import type { FormState } from '@/components/form-bits';

const uuid = (v: FormDataEntryValue | null) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const why = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

/** Recharge tout de suite les produits depuis Printful (sinon toutes les 10 minutes). */
export async function refreshCatalog(): Promise<FormState> {
  await requireAdmin('/admin/boutique');
  forgetCatalogFailure();
  revalidateTag(SHOP_CACHE_TAG, { expire: 0 });
  revalidatePath('/admin/boutique');
  return { ok: true, message: 'Catalogue rechargé depuis Printful.' };
}

/** Demande à Printful de prévenir le site à chaque expédition, blocage ou annulation. */
export async function connectWebhook(): Promise<FormState> {
  const { session } = await requireAdmin('/admin/boutique');
  const url = `${env.siteUrl().replace(/\/$/, '')}/api/boutique/printful`;
  try {
    await registerWebhook(url);
  } catch (err) {
    return { error: `Printful refuse : ${why(err)}` };
  }
  await logAudit(session, 'boutique.notifications', undefined, { url });
  revalidatePath('/admin/boutique');
  return { ok: true, message: 'Notifications Printful branchées : les expéditions arrivent maintenant toutes seules.' };
}

export async function resubmitOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/boutique');
  const id = uuid(formData.get('id'));
  if (!id) return { error: 'Commande inconnue.' };
  const order = await submitToPrintful(id);
  await logAudit(session, 'boutique.renvoi', { type: 'shop_order', id }, { statut: order?.status });
  revalidatePath('/admin/boutique');
  return order?.status === 'submitted' ? { ok: true, message: 'Commande transmise à Printful.' } : { error: `Toujours refusée : ${order?.error ?? 'raison inconnue'}` };
}

export async function resyncOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin('/admin/boutique');
  const id = uuid(formData.get('id'));
  if (!id) return { error: 'Commande inconnue.' };
  try {
    const order = await syncShopOrder(id);
    revalidatePath('/admin/boutique');
    return { ok: true, message: `Statut Printful : ${order?.printful_status ?? 'inconnu'}.` };
  } catch (err) {
    return { error: why(err) };
  }
}
