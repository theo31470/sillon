import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { Logo } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import { AdminNav } from './admin-nav';
import { IdleLogout } from './idle-logout';
import { PageTransition } from '@/components/motion';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: { default: 'Administration', template: '%s · Admin Tracteurs & Co' }, robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const { profile } = await requireAdmin('/admin');
  const supabase = await createClient();
  const { count } = await supabase.from('tech_sheets').select('id', { count: 'exact', head: true }).eq('status', 'review');

  return (
    <div className="flex min-h-full flex-1 flex-wrap bg-ground">
      <aside className="flex max-w-full flex-[1_1_240px] flex-col gap-6 bg-admin px-3.5 py-5 text-panel lg:max-w-[260px]">
        <div className="flex flex-col gap-3 px-2">
          <Logo tone="dark" height={30} />
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-on-brand">Admin</span>
            <ThemeToggle className="border-admin-2 text-panel-muted" />
          </div>
        </div>
        <AdminNav pendingSheets={count ?? 0} />
        <div className="mt-auto rounded-xl bg-admin-2 p-3.5 text-[13px]">
          <p className="font-semibold text-white">{profile.full_name || profile.email}</p>
          <p className="mb-2 text-panel-muted">Administrateur</p>
          <p className="text-success">● Double authentification active</p>
          <p className="text-panel-muted">Déconnexion après 30 min d’inactivité</p>
        </div>
      </aside>
      <main className="min-w-0 flex-[999_1_640px] px-8 py-7">
        <PageTransition>
          <div className="flex flex-col gap-5">{children}</div>
        </PageTransition>
      </main>
      <IdleLogout minutes={30} />
    </div>
  );
}
