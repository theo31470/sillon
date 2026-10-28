import type { MetadataRoute } from 'next';

/** Application installable : « Ajouter à l’écran d’accueil » ouvre directement l’espace membre, plein écran. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tracteurs & Co',
    short_name: 'Tracteurs & Co',
    description: 'Le carnet de santé de votre matériel agricole : entretiens, compteurs, dépenses et coût de revient.',
    lang: 'fr',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#12110f',
    theme_color: '#12110f',
    categories: ['business', 'productivity', 'utilities'],
    icons: [
      { src: '/brand/app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/app-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Mon parc', url: '/app/materiel' },
      { name: 'Aide au diagnostic', url: '/app/diagnostic' },
    ],
  };
}
