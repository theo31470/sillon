import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { listPublishedPosts, listPublishedSheets } from '@/lib/content';
import { slugify } from '@/lib/format';
import { listingsForSitemap } from '@/lib/bourse';
import { listingPath } from '@/lib/bourse-shared';

// Calculé à chaque lecture : une fiche publiée y apparaît aussitôt.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = env.siteUrl().replace(/\/$/, '');
  const [sheets, posts, listings] = await Promise.all([listPublishedSheets(), listPublishedPosts({ limit: 1000 }), listingsForSitemap().catch(() => [])]);
  const last = (dates: (string | null | undefined)[]) => {
    const t = Math.max(0, ...dates.map((d) => (d ? Date.parse(d) : 0)).filter(Number.isFinite));
    return t ? new Date(t) : new Date();
  };

  const brands = new Map<string, string[]>();
  for (const s of sheets) {
    if (!s.brand) continue;
    const key = slugify(s.brand);
    brands.set(key, [...(brands.get(key) ?? []), s.updated_at]);
  }

  return [
    { url: `${site}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${site}/fiches`, lastModified: last(sheets.map((s) => s.updated_at)), changeFrequency: 'daily', priority: 0.9 },
    { url: `${site}/tarifs`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${site}/bourse`, lastModified: last(listings.map((l) => l.updated_at)), changeFrequency: 'daily', priority: 0.8 },
    { url: `${site}/blog`, lastModified: last(posts.map((p) => p.published_at)), changeFrequency: 'weekly', priority: 0.6 },
    { url: `${site}/contact`, changeFrequency: 'yearly', priority: 0.3 },
    ...[...brands].map(([slug, dates]) => ({ url: `${site}/fiches/marque/${slug}`, lastModified: last(dates), changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...sheets.map((s) => ({ url: `${site}/fiches/${s.slug}`, lastModified: new Date(s.updated_at), changeFrequency: 'monthly' as const, priority: 0.8 })),
    ...listings.map((l) => ({ url: `${site}${listingPath(l)}`, lastModified: new Date(l.updated_at), changeFrequency: 'weekly' as const, priority: 0.6 })),
    ...posts.map((p) => ({ url: `${site}/blog/${p.slug}`, lastModified: p.published_at ? new Date(p.published_at) : undefined, changeFrequency: 'monthly' as const, priority: 0.5 })),
  ];
}
