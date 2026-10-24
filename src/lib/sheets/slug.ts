import 'server-only';
import { createServiceClient } from '@/lib/supabase/admin';
import { slugify } from '@/lib/format';

/** Adresse de page libre pour une nouvelle fiche (ajoute -2, -3… si besoin). */
export async function uniqueSheetSlug(title: string) {
  const base = slugify(title) || 'fiche';
  const { data } = await createServiceClient().from('tech_sheets').select('slug').like('slug', `${base}%`);
  const taken = new Set((data ?? []).map((r) => r.slug));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
