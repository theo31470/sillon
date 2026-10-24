import Link from 'next/link';
import { Logo } from '@/components/ui';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center bg-ground px-6 py-12">
      <Link href="/" className="mb-8" aria-label="Sillon, accueil">
        <Logo />
      </Link>
      <main className="w-full max-w-md rounded-2xl border border-line bg-white p-8">{children}</main>
    </div>
  );
}
