import Link from 'next/link';
import { Logo } from '@/components/ui';
import { PageTransition } from '@/components/motion';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center bg-ground px-6 py-12">
      <Link href="/" className="mb-8 transition-opacity hover:opacity-80" aria-label="Tracteurs & Co, accueil">
        <Logo variant="vertical" height={120} />
      </Link>
      <main className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-[0_20px_40px_-30px_rgba(0,0,0,0.60)]">
        <PageTransition>
          <div>{children}</div>
        </PageTransition>
      </main>
    </div>
  );
}
