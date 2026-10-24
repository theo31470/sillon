import { NextResponse, type NextRequest } from 'next/server';
import { getAdminOrNull, hasRecentMfa } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';

/** Export des données d'un membre par un admin (demande RGPD). Exige un code 2FA récent. */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/admin/membres/[id]/export'>) {
  const admin = await getAdminOrNull();
  if (!admin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  if (!hasRecentMfa(admin.session)) {
    return NextResponse.json({ error: 'Validez à nouveau votre code de double authentification.' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });

  const db = createServiceClient();
  const [profile, machines, readings, maintenance, tasks, costs, subscriptions, payments] = await Promise.all([
    db.from('profiles').select('email, full_name, farm_name, plan, created_at').eq('id', id).single(),
    db.from('machines').select('*').eq('user_id', id),
    db.from('hour_readings').select('*').eq('user_id', id),
    db.from('maintenance_logs').select('*').eq('user_id', id),
    db.from('machine_tasks').select('*').eq('user_id', id),
    db.from('machine_costs').select('*').eq('user_id', id),
    db.from('subscriptions').select('status, plan, current_period_end, created_at').eq('user_id', id),
    db.from('payments').select('amount_cents, currency, status, created_at').eq('user_id', id),
  ]);
  if (!profile.data) return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 });

  await logAudit(admin.session, 'membre.donnees_exportees', { type: 'profile', id });
  return new NextResponse(
    JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        profile: profile.data,
        machines: machines.data,
        hour_readings: readings.data,
        maintenance_logs: maintenance.data,
        maintenance_plan: tasks.data,
        costs: costs.data,
        subscriptions: subscriptions.data,
        payments: payments.data,
      },
      null,
      2,
    ),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="export-membre-${id.slice(0, 8)}.json"`,
        'Cache-Control': 'private, no-store',
      },
    },
  );
}
