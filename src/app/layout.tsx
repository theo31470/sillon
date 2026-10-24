import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NavigationProgress } from '@/components/motion';
import '@fontsource-variable/inter';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Sillon — gérez votre exploitation simplement',
    template: '%s · Sillon',
  },
  description:
    'Parcelles, registre des interventions, météo, suivi du matériel et fiches techniques : l’application simple pour les exploitations agricoles.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fr" className="h-full" data-scroll-behavior="smooth">
      <body className="flex min-h-full flex-col">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
