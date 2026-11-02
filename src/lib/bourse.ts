import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import type { ListingCategory, ListingCondition, ListingDelivery, ListingPhoto, ListingStatus } from '@/lib/bourse-shared';

/** Bourse au matériel : lecture des annonces (règles d'accès appliquées par la base). */

export type Listing = {
  id: string;
  ref: string;
  seller_id: string;
  machine_id: string | null;
  sheet_id: string | null;
  title: string;
  description: string;
  category: ListingCategory;
  condition: ListingCondition;
  price_cents: number;
  negotiable: boolean;
  brand: string;
  model: string;
  year: number | null;
  hours: number | null;
  postal_code: string;
  city: string;
  department: string;
  delivery: ListingDelivery;
  weight_kg: number | null;
  photos: ListingPhoto[];
  status: ListingStatus;
  moderation_note: string | null;
  views: number;
  created_at: string;
  published_at: string | null;
  updated_at: string;
};

export const PUBLIC_STATUSES = ['en_ligne', 'reservee', 'vendue'] as const;
export const PAGE_SIZE = 24;

export type ListingFilters = {
  q?: string;
  category?: ListingCategory | null;
  department?: string | null;
  delivery?: 'envoi' | 'main_propre' | null;
  min?: number | null;
  max?: number | null;
  sort?: 'recent' | 'prix_asc' | 'prix_desc';
  page?: number;
};

/** Texte de recherche nettoyé pour un filtre « contient » (pas de caractères spéciaux du filtre). */
const searchable = (q: string) => q.replace(/[,()%*\\:"'.]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

export async function searchListings(f: ListingFilters) {
  const supabase = await createClient();
  const page = Math.max(1, Math.min(50, f.page ?? 1));
  let q = supabase
    .from('listings')
    .select('*', { count: 'exact' })
    .in('status', ['en_ligne', 'reservee']);
  if (f.category) q = q.eq('category', f.category);
  if (f.department) q = q.eq('department', f.department);
  if (f.delivery === 'envoi') q = q.in('delivery', ['envoi', 'les_deux']);
  if (f.delivery === 'main_propre') q = q.in('delivery', ['main_propre', 'les_deux']);
  if (f.min) q = q.gte('price_cents', Math.round(f.min * 100));
  if (f.max) q = q.lte('price_cents', Math.round(f.max * 100));
  const text = f.q ? searchable(f.q) : '';
  if (text) {
    for (const word of text.split(' ').slice(0, 5)) {
      const w = `%${word}%`;
      q = q.or(`title.ilike.${w},brand.ilike.${w},model.ilike.${w},description.ilike.${w}`);
    }
  }
  if (f.sort === 'prix_asc') q = q.order('price_cents', { ascending: true });
  else if (f.sort === 'prix_desc') q = q.order('price_cents', { ascending: false });
  else q = q.order('published_at', { ascending: false, nullsFirst: false });
  const { data, count, error } = await q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) console.error('[bourse] recherche', error.message);
  return { listings: (data ?? []) as Listing[], total: count ?? 0, page };
}

export async function getListingByRef(ref: string) {
  if (!/^[0-9a-f]{8}$/.test(ref)) return null;
  const { data } = await (await createClient()).from('listings').select('*').eq('ref', ref).maybeSingle();
  return (data as Listing | null) ?? null;
}

export async function getOwnListing(id: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await (await createClient()).from('listings').select('*').eq('id', id).eq('seller_id', userId).maybeSingle();
  return (data as Listing | null) ?? null;
}

export type SellerCard = { id: string; name: string; since: string; sold: number; online: number };

/** Ce que l'acheteur voit du vendeur : prénom et initiale, ancienneté, ventes (jamais l'e-mail ni l'adresse). */
export async function sellerCard(sellerId: string): Promise<SellerCard | null> {
  const db = createServiceClient();
  const [{ data: p }, { count: sold }, { count: online }] = await Promise.all([
    db.from('profiles').select('id, full_name, created_at').eq('id', sellerId).maybeSingle(),
    db.from('listings').select('id', { count: 'exact', head: true }).eq('seller_id', sellerId).eq('status', 'vendue'),
    db.from('listings').select('id', { count: 'exact', head: true }).eq('seller_id', sellerId).eq('status', 'en_ligne'),
  ]);
  if (!p) return null;
  return { id: p.id as string, name: publicName(p.full_name as string), since: p.created_at as string, sold: sold ?? 0, online: online ?? 0 };
}

/** « Julien M. » */
export function publicName(fullName: string | null | undefined) {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Membre';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

/** Vue d'annonce comptée (une fois par visite, côté serveur). */
export async function countView(listingId: string, current: number) {
  await createServiceClient().from('listings').update({ views: current + 1 }).eq('id', listingId);
}

/** Annonces en ligne pour le plan du site. */
export async function listingsForSitemap() {
  const { data } = await createServiceClient().from('listings').select('ref, title, updated_at').in('status', ['en_ligne', 'reservee']).order('updated_at', { ascending: false }).limit(5000);
  return (data ?? []) as { ref: string; title: string; updated_at: string }[];
}

export type Conversation = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  created_at: string;
  last_message_at: string;
  buyer_read_at: string | null;
  seller_read_at: string | null;
};

/** La conversation est lue par cette personne (à l'ouverture). */
export async function markConversationRead(conv: Conversation, userId: string) {
  const now = new Date().toISOString();
  const db = createServiceClient();
  if (userId === conv.buyer_id) await db.from('listing_conversations').update({ buyer_read_at: now }).eq('id', conv.id);
  else if (userId === conv.seller_id) await db.from('listing_conversations').update({ seller_read_at: now }).eq('id', conv.id);
}
