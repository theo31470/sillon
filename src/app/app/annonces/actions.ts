'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';
import {
  DELIVERY_LABELS,
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  MAX_LISTING_PHOTOS,
  MAX_PARCEL_KG,
  departmentOf,
  type ListingPhoto,
} from '@/lib/bourse-shared';
import type { FormState } from '@/components/form-bits';

/** Annonces en ligne en même temps, par membre (contre les abus). */
const MAX_ONLINE = 40;
const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const photoPrefix = (userId: string) => `annonces/${userId}/`;

const number = (label: string, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v.replace(/\s/g, '').replace(',', '.'))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= max), `${label} : valeur invalide`);

const listingSchema = z
  .object({
    id: z.union([z.string().uuid(), z.literal('')]),
    machine_id: z.union([z.string().uuid(), z.literal('')]),
    sheet_id: z.union([z.string().uuid(), z.literal('')]),
    title: z.string().trim().min(5, 'Le titre doit faire au moins 5 caractères.').max(90, 'Titre trop long (90 caractères).'),
    description: z.string().trim().max(5000, 'Description trop longue (5 000 caractères).'),
    category: z.enum(keys(LISTING_CATEGORIES), { message: 'Choisissez une catégorie.' }),
    condition: z.enum(keys(LISTING_CONDITIONS), { message: 'Indiquez l’état.' }),
    price: number('Prix', 1_000_000).refine((v) => v !== null && v >= 1, 'Indiquez un prix d’au moins 1 €.'),
    negotiable: z.boolean(),
    brand: z.string().trim().max(60),
    model: z.string().trim().max(80),
    year: number('Année', 2100).refine((v) => v === null || v >= 1900, 'Année invalide'),
    hours: number('Heures', 999_999),
    postal_code: z.string().trim().regex(/^\d{5}$/, 'Code postal à 5 chiffres.'),
    city: z.string().trim().min(1, 'Indiquez la commune.').max(100),
    delivery: z.enum(keys(DELIVERY_LABELS)),
    weight_kg: number('Poids', MAX_PARCEL_KG),
    shipping: number('Frais de port', 200),
    photos: z.array(z.object({ path: z.string(), url: z.string().url(), w: z.number().optional(), h: z.number().optional() })).max(MAX_LISTING_PHOTOS),
    intent: z.enum(['brouillon', 'publier']),
  })
  .superRefine((v, ctx) => {
    if (v.delivery !== 'main_propre' && v.shipping === null) ctx.addIssue({ code: 'custom', message: 'Indiquez les frais de port demandés à l’acheteur (0 si l’envoi est offert).', path: ['shipping'] });
    if (v.delivery !== 'main_propre' && !v.weight_kg) ctx.addIssue({ code: 'custom', message: `Pour un envoi par colis, indiquez le poids (${MAX_PARCEL_KG} kg au plus ; au-delà, remise en main propre).`, path: ['weight_kg'] });
    if (v.intent === 'publier' && v.photos.length === 0) ctx.addIssue({ code: 'custom', message: 'Ajoutez au moins une photo pour publier l’annonce.', path: ['photos'] });
  });

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v : '';
};

/** Crée ou met à jour une annonce (brouillon ou publiée). */
export async function saveListing(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireUser('/app/annonces');
  let photos: unknown = [];
  try {
    photos = JSON.parse(str(formData, 'photos') || '[]');
  } catch {
    photos = [];
  }
  const parsed = listingSchema.safeParse({
    id: str(formData, 'id'),
    machine_id: str(formData, 'machine_id'),
    sheet_id: str(formData, 'sheet_id'),
    title: str(formData, 'title'),
    description: str(formData, 'description'),
    category: str(formData, 'category'),
    condition: str(formData, 'condition'),
    price: str(formData, 'price'),
    negotiable: formData.get('negotiable') === 'on',
    brand: str(formData, 'brand'),
    model: str(formData, 'model'),
    year: str(formData, 'year'),
    hours: str(formData, 'hours'),
    postal_code: str(formData, 'postal_code'),
    city: str(formData, 'city'),
    delivery: str(formData, 'delivery'),
    weight_kg: str(formData, 'weight_kg'),
    shipping: str(formData, 'shipping'),
    photos,
    intent: str(formData, 'intent') === 'publier' ? 'publier' : 'brouillon',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Annonce incomplète.' };
  const v = parsed.data;
  // Les photos doivent venir de l'envoi de ce membre (dossier à son nom).
  if (v.photos.some((p) => !p.path.startsWith(photoPrefix(session.userId)))) return { error: 'Photo invalide : renvoyez-la.' };
  const department = departmentOf(v.postal_code);
  if (!department) return { error: 'Code postal invalide.' };

  const supabase = await createClient();
  if (v.intent === 'publier') {
    const { count } = await supabase.from('listings').select('id', { count: 'exact', head: true }).eq('seller_id', session.userId).eq('status', 'en_ligne').neq('id', v.id || '00000000-0000-0000-0000-000000000000');
    if ((count ?? 0) >= MAX_ONLINE) return { error: `Vous avez déjà ${MAX_ONLINE} annonces en ligne : retirez-en une avant d’en publier une autre.` };
  }
  if (!rateLimit(`annonce:${session.userId}`, 30, 60 * 60_000).ok) return { error: 'Trop d’enregistrements d’affilée : patientez un peu.' };

  const row = {
    seller_id: session.userId,
    machine_id: v.machine_id || null,
    sheet_id: v.sheet_id || null,
    title: v.title,
    description: v.description,
    category: v.category,
    condition: v.condition,
    price_cents: Math.round((v.price as number) * 100),
    negotiable: v.negotiable,
    brand: v.brand,
    model: v.model,
    year: v.year,
    hours: v.hours,
    postal_code: v.postal_code,
    city: v.city,
    department,
    delivery: v.delivery,
    weight_kg: v.delivery === 'main_propre' ? null : v.weight_kg,
    shipping_cents: v.delivery === 'main_propre' || v.shipping === null ? null : Math.round(v.shipping * 100),
    photos: v.photos,
    updated_at: new Date().toISOString(),
  };

  let ref: string;
  let id: string;
  if (v.id) {
    const { data: current } = await supabase.from('listings').select('status, published_at').eq('id', v.id).eq('seller_id', session.userId).maybeSingle();
    if (!current) return { error: 'Annonce introuvable.' };
    if (current.status === 'moderee') return { error: 'Cette annonce a été retirée par la modération : elle ne peut plus être modifiée.' };
    const status = v.intent === 'publier' ? (current.status === 'brouillon' || current.status === 'retiree' ? 'en_ligne' : current.status) : current.status === 'brouillon' ? 'brouillon' : current.status;
    const { data, error } = await supabase
      .from('listings')
      .update({ ...row, status, published_at: status === 'en_ligne' && !current.published_at ? new Date().toISOString() : current.published_at })
      .eq('id', v.id)
      .select('id, ref')
      .single();
    if (error || !data) return { error: 'Enregistrement impossible. Réessayez.' };
    ({ id, ref } = data as { id: string; ref: string });
  } else {
    const publish = v.intent === 'publier';
    const { data, error } = await supabase
      .from('listings')
      .insert({ ...row, status: publish ? 'en_ligne' : 'brouillon', published_at: publish ? new Date().toISOString() : null })
      .select('id, ref')
      .single();
    if (error || !data) return { error: 'Enregistrement impossible : votre compte ne peut pas publier pour le moment.' };
    ({ id, ref } = data as { id: string; ref: string });
  }
  revalidatePath('/bourse');
  revalidatePath('/app/annonces');
  redirect(v.intent === 'publier' ? `/app/annonces?publiee=${ref}` : `/app/annonces/${id}?enregistree=1`);
}

const MAX_PHOTO_BASE64 = 2_400_000; // ≈ 1,8 Mo : la photo est réduite dans le navigateur avant l'envoi.

/** Envoi d'une photo d'annonce (réduite à 1 600 px dans le navigateur). */
export async function uploadListingPhoto(input: { base64: string; mime: string; w: number; h: number }): Promise<{ ok: ListingPhoto } | { error: string }> {
  const { session } = await requireUser('/app/annonces');
  const parsed = z
    .object({ base64: z.string().min(100).max(MAX_PHOTO_BASE64).regex(/^[A-Za-z0-9+/=]+$/), mime: z.enum(['image/jpeg', 'image/webp']), w: z.number().int().min(1).max(4000), h: z.number().int().min(1).max(4000) })
    .safeParse(input);
  if (!parsed.success) return { error: 'Photo non prise en charge : envoyez une image JPEG ou PNG.' };
  if (!rateLimit(`annonce-photo:${session.userId}`, 60, 30 * 60_000).ok) return { error: 'Trop de photos envoyées d’affilée : patientez quelques minutes.' };
  const ext = parsed.data.mime === 'image/webp' ? 'webp' : 'jpg';
  const path = `${photoPrefix(session.userId)}${randomUUID()}.${ext}`;
  const db = createServiceClient();
  const { error } = await db.storage.from('media').upload(path, Buffer.from(parsed.data.base64, 'base64'), { contentType: parsed.data.mime, upsert: false, cacheControl: '31536000' });
  if (error) return { error: 'Envoi impossible pour le moment. Réessayez.' };
  return { ok: { path, url: db.storage.from('media').getPublicUrl(path).data.publicUrl, w: parsed.data.w, h: parsed.data.h } };
}

/** Réservée, vendue, retirée ou remise en ligne. */
export async function setListingStatus(formData: FormData) {
  const { session } = await requireUser('/app/annonces');
  const id = z.string().uuid().safeParse(formData.get('id'));
  const status = z.enum(['en_ligne', 'reservee', 'vendue', 'retiree']).safeParse(formData.get('status'));
  if (!id.success || !status.success) return;
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status: status.data, updated_at: new Date().toISOString() };
  if (status.data === 'en_ligne') {
    const { data } = await supabase.from('listings').select('published_at, photos').eq('id', id.data).eq('seller_id', session.userId).maybeSingle();
    if (!data || !(data.photos as unknown[]).length) return;
    if (!data.published_at) patch.published_at = new Date().toISOString();
  }
  await supabase.from('listings').update(patch).eq('id', id.data).eq('seller_id', session.userId);
  revalidatePath('/app/annonces');
  revalidatePath('/bourse');
}

/** Suppression définitive (photos comprises). */
export async function deleteListing(formData: FormData) {
  const { session } = await requireUser('/app/annonces');
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  const { data } = await supabase.from('listings').delete().eq('id', id.data).eq('seller_id', session.userId).select('photos').maybeSingle();
  const paths = ((data?.photos ?? []) as ListingPhoto[]).map((p) => p.path).filter((p) => p.startsWith(photoPrefix(session.userId)));
  if (paths.length) await createServiceClient().storage.from('media').remove(paths);
  revalidatePath('/app/annonces');
  revalidatePath('/bourse');
  redirect('/app/annonces?supprimee=1');
}
