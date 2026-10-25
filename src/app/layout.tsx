import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { NavigationProgress } from '@/components/motion';
import '@fontsource-variable/inter';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow/800.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Tracteurs & Co — le carnet de santé de votre matériel agricole',
    template: '%s · Tracteurs & Co',
  },
  description:
    'Tracteurs & Co, machinisme agricole : entretiens, compteurs, coût de revient à l’heure, fiches techniques et aide au diagnostic de votre matériel.',
  applicationName: 'Tracteurs & Co',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#12110f' },
    { media: '(prefers-color-scheme: light)', color: '#12110f' },
  ],
};

// Applique le thème mémorisé avant l'affichage (pas de flash). Sombre par défaut.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fr" className="h-full" data-theme="dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
