import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { Logo } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import { AdminNav } from './admin-nav';
import { MobileMenu } from '@/components/mobile-menu';
import { IdleLogout } from './idle-logout';
import { PageTransition } from '@/components/motion';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: { default: 'Administration', template: '%s · Admin Tracteurs & Co' }, robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const { profile } = await requireAdmin('/admin');
  const supabase = await createClient();
  const [{ count }, { count: newMessages }] = await Promise.all([
    supabase.from('tech_sheets').select('id', { count: 'exact', head: true }).eq('status', 'review'),
    supabase.from('contact_messages').select('id', { count: 'exact', head: true }).eq('status', 'nouveau'),
  ]);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-ground lg:flex-row">
      {/* Téléphone et tablette : barre du haut et menu latéral */}
      <header className="no-print sticky top-0 z-30 flex items-center gap-3 bg-admin px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-panel lg:hidden">
        <Logo tone="dark" height={26} />
        <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-brand">Admin</span>
        <span className="ml-auto" />
        {(newMessages ?? 0) + (count ?? 0) > 0 ? (
          <span className="rounded-full bg-wheat px-2 text-xs font-bold text-admin" title="Messages nouveaux et fiches à relire">{(newMessages ?? 0) + (count ?? 0)}</span>
        ) : null}
        <MobileMenu label="Menu de l’administration" tone="admin">
          <AdminNav pendingSheets={count ?? 0} newMessages={newMessages ?? 0} />
          <div className="mt-auto flex flex-col gap-3 pt-4">
            <div className="flex items-center justify-between rounded-xl bg-admin-2 p-3.5 text-[13px]">
              <div>
                <p className="font-semibold text-white">{profile.full_name || profile.email}</p>
                <p className="text-success">● Double authentification active</p>
              </div>
              <ThemeToggle className="border-admin text-panel-muted" />
            </div>
          </div>
        </MobileMenu>
      </header>

      <aside className="hidden w-[260px] flex-none flex-col gap-6 bg-admin px-3.5 py-5 text-panel lg:flex">
        <div className="flex flex-col gap-3 px-2">
          <Logo tone="dark" height={30} />
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-on-brand">Admin</span>
            <ThemeToggle className="border-admin-2 text-panel-muted" />
          </div>
        </div>
        <AdminNav pendingSheets={count ?? 0} newMessages={newMessages ?? 0} />
        <div className="mt-auto rounded-xl bg-admin-2 p-3.5 text-[13px]">
          <p className="font-semibold text-white">{profile.full_name || profile.email}</p>
          <p className="mb-2 text-panel-muted">Administrateur</p>
          <p className="text-success">● Double authentification active</p>
          <p className="text-panel-muted">Déconnexion après 30 min d’inactivité</p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-8 lg:py-7">
        <PageTransition>
          <div className="flex flex-col gap-5">{children}</div>
        </PageTransition>
      </main>
      <IdleLogout minutes={30} />
    </div>
  );
}
