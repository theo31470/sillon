import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const site = env.siteUrl().replace(/\/$/, '');
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/app', '/admin', '/api/', '/auth/', '/securite', '/compte-suspendu', '/preferences-e-mail', '/p/', '/demo', '/invitation/'] }],
    sitemap: `${site}/sitemap.xml`,
  };
}
