import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { BlogPost, TechSheet } from '@/lib/types';

/**
 * Lecture du contenu public (articles, fiches). Les règles RLS garantissent
 * que seuls les articles publiés et les fiches validées sont renvoyés.
 * En cas de base non configurée, on renvoie une liste vide plutôt que de planter.
 */

const postColumns = 'id, slug, title, excerpt, category, cover_url, author_name, published_at, status, seo_description, created_at, updated_at';

export async function listPublishedPosts(opts: { category?: string; search?: string; limit?: number } = {}) {
  try {
    const supabase = await createClient();
    let query = supabase
      .from('blog_posts')
      .select(postColumns)
      .not('published_at', 'is', null)
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(opts.limit ?? 24);
    if (opts.category) query = query.eq('category', opts.category);
    if (opts.search) query = query.ilike('title', `%${opts.search.replace(/[%_]/g, '')}%`);
    const { data } = await query;
    return (data ?? []) as Omit<BlogPost, 'content_md'>[];
  } catch {
    return [];
  }
}

export async function getPublishedPost(slug: string) {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from('blog_posts').select('*').eq('slug', slug).maybeSingle();
    return (data as BlogPost | null) ?? null;
  } catch {
    return null;
  }
}

export async function listPublishedSheets(opts: { category?: string; search?: string } = {}) {
  try {
    const supabase = await createClient();
    let query = supabase
      .from('tech_sheets')
      .select('id, slug, title, category, brand, model, summary, cover_url, cover_credit, content, published_at, updated_at')
      .eq('status', 'published')
      .order('title');
    if (opts.category) query = query.eq('category', opts.category);
    if (opts.search) query = query.ilike('title', `%${opts.search.replace(/[%_]/g, '')}%`);
    const { data } = await query;
    return (data ?? []) as Pick<TechSheet, 'id' | 'slug' | 'title' | 'category' | 'brand' | 'model' | 'summary' | 'cover_url' | 'cover_credit' | 'content' | 'published_at' | 'updated_at'>[];
  } catch {
    return [];
  }
}

export async function getPublishedSheet(slug: string) {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from('tech_sheets').select('*').eq('slug', slug).eq('status', 'published').maybeSingle();
    return (data as TechSheet | null) ?? null;
  } catch {
    return null;
  }
}

/** Marques ayant au moins une fiche publiée, avec leur nombre de fiches. */
export async function listPublishedBrands() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from('tech_sheets').select('brand').eq('status', 'published').neq('brand', '');
    const counts = new Map<string, number>();
    for (const r of data ?? []) counts.set(r.brand as string, (counts.get(r.brand as string) ?? 0) + 1);
    return [...counts].map(([brand, count]) => ({ brand, count })).sort((a, b) => a.brand.localeCompare(b.brand, 'fr'));
  } catch {
    return [];
  }
}

/** Fiches publiées d'une marque, avec la série du catalogue quand elle est connue. */
export async function listBrandSheets(brand: string) {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('tech_sheets')
      .select('id, slug, title, category, brand, model, summary, cover_url, cover_credit, content, published_at, updated_at')
      .eq('status', 'published')
      .ilike('brand', brand.replace(/[%_]/g, ''))
      .order('title');
    const sheets = (data ?? []) as Pick<TechSheet, 'id' | 'slug' | 'title' | 'category' | 'brand' | 'model' | 'summary' | 'cover_url' | 'cover_credit' | 'content' | 'published_at' | 'updated_at'>[];
    // La série vient du catalogue d'import (lecture réservée à l'admin) : client de service, colonnes publiques seulement.
    const { createServiceClient } = await import('@/lib/supabase/admin');
    const { data: models } = sheets.length
      ? await createServiceClient().from('catalog_models').select('sheet_id, series, power_hp').in('sheet_id', sheets.map((s) => s.id))
      : { data: [] };
    const bySheet = new Map((models ?? []).map((m) => [m.sheet_id as string, { series: (m.series as string) || '', power: (m.power_hp as number | null) ?? null }]));
    return sheets.map((s) => ({ ...s, series: bySheet.get(s.id)?.series ?? '', power: bySheet.get(s.id)?.power ?? null }));
  } catch {
    return [];
  }
}
