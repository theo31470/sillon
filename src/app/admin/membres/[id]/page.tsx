import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { hasRecentMfa, requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { diagnosticQuota, parisMonthStart } from '@/lib/diagnostic-quota';
import type { MemberAdmin, Payment, Profile, Subscription } from '@/lib/types';
import { MemberView, TABS, type Tab } from './member-view';

export const metadata: Metadata = { title: 'Fiche membre' };
export const dynamic = 'force-dynamic';

export default async function MemberPage(props: PageProps<'/admin/membres/[id]'>) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { onglet } = await props.searchParams;
  const tab: Tab = typeof onglet === 'string' && onglet in TABS ? (onglet as Tab) : 'abonnement';
  const { session } = await requireAdmin(`/admin/membres/${id}`);
  const supabase = await createClient();
  const service = createServiceClient();

  const { data: p } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (!p) notFound();
  const member = p as Profile;

  const [subsRes, paymentsRes, fileRes, emailsRes, auditRes, machines, logs, aiRes, authRes, tagsRes, quota] = await Promise.all([
    supabase.from('subscriptions').select('*').eq('user_id', id).order('created_at', { ascending: false }),
    supabase.from('payments').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(6),
    supabase.from('member_admin').select('*').eq('user_id', id).maybeSingle(),
    supabase.from('email_log').select('id, kind, subject, status, created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(8),
    supabase.from('audit_log').select('id, actor_email, action, created_at').eq('target_id', id).order('created_at', { ascending: false }).limit(10),
    // Comptages seulement : l'admin ne lit pas le contenu des exploitations.
    service.from('machines').select('id', { count: 'exact', head: true }).eq('user_id', id),
    service.from('maintenance_logs').select('id', { count: 'exact', head: true }).eq('user_id', id),
    service.from('ai_usage').select('feature, cost_usd').eq('user_id', id).gte('created_at', parisMonthStart().toISOString()),
    service.auth.admin.getUserById(id),
    service.rpc('admin_member_tags'),
    diagnosticQuota(id),
  ]);
  const authUser = authRes.data?.user ?? null;
  const ai = aiRes.data ?? [];

  return (
    <MemberView
      tab={tab}
      data={{
        member,
        subs: (subsRes.data ?? []) as Subscription[],
        payments: (paymentsRes.data ?? []) as Payment[],
        file: (fileRes.data ?? null) as MemberAdmin | null,
        emails: emailsRes.data ?? [],
        audit: auditRes.data ?? [],
        machines: machines.count ?? 0,
        logs: logs.count ?? 0,
        ai: { diagnostics: ai.filter((r) => r.feature === 'diagnostic').length, costUsd: ai.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0) },
        auth: {
          lastSignInAt: authUser?.last_sign_in_at ?? null,
          emailConfirmedAt: authUser?.email_confirmed_at ?? null,
          mfa: (authUser?.factors ?? []).some((f) => f.status === 'verified'),
        },
        allTags: ((tagsRes.data ?? []) as { tag: string }[]).map((t) => t.tag),
        quota: { usedMonth: quota.usedMonth, limit: quota.limit },
        self: member.id === session.userId,
        recentMfa: hasRecentMfa(session),
      }}
    />
  );
}
