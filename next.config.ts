import type { NextConfig } from 'next';

// En-têtes de sécurité appliqués à toutes les pages.
const securityHeaders = [
  // Force le HTTPS pendant 2 ans (sous-domaines compris).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Interdit l'affichage du site dans une iframe (anti « clickjacking »).
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js injecte des scripts en ligne ; pour aller plus loin, voir le guide CSP à nonce (README).
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.open-meteo.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      // Les formulaires peuvent rediriger vers les pages de paiement Stripe.
      "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // Cache Components désactivé volontairement : voir README (« Choix techniques »).
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Photos de couverture du blog (5 Mo max côté stockage).
      bodySizeLimit: '6mb',
    },
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' }],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
