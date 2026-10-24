import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NavigationProgress } from '@/components/motion';
import '@fontsource-variable/inter';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Sillon — le carnet de santé de votre matériel agricole',
    template: '%s · Sillon',
  },
  description:
    'Le carnet de santé de votre matériel agricole : entretiens, compteurs, coût de revient à l’heure, fiches techniques et aide au diagnostic.',
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
