import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';

/** Export de toutes les données de l'exploitant connecté (portabilité RGPD). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  if (!rateLimit(`export:${session.userId}`, 5, 60 * 60_000).ok) {
    return NextResponse.json({ error: 'Trop de demandes, réessayez plus tard.' }, { status: 429 });
  }

  const supabase = await createClient();
  // Chaque requête est filtrée par les règles RLS : uniquement les données de l'utilisateur.
  const [profile, parcels, interventions, machines, maintenance, subscriptions, payments] = await Promise.all([
    supabase.from('profiles').select('email, full_name, farm_name, plan, latitude, longitude, created_at').eq('id', session.userId).single(),
    supabase.from('parcels').select('*'),
    supabase.from('interventions').select('*'),
    supabase.from('machines').select('*'),
    supabase.from('maintenance_logs').select('*'),
    supabase.from('subscriptions').select('status, plan, current_period_end, created_at'),
    supabase.from('payments').select('amount_cents, currency, status, created_at'),
  ]);

  const body = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      profile: profile.data,
      parcels: parcels.data,
      interventions: interventions.data,
      machines: machines.data,
      maintenance_logs: maintenance.data,
      subscriptions: subscriptions.data,
      payments: payments.data,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="sillon-mes-donnees-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
