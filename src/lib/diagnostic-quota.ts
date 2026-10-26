import 'server-only';
import { createServiceClient } from '@/lib/supabase/admin';

/**
 * Quota de l'aide au diagnostic, compté en base (table ai_usage) : il tient
 * même quand Vercel démarre plusieurs serveurs. Seuls les diagnostics réussis
 * comptent (une erreur ne consomme rien).
 */
import { DIAGNOSTIC_DAILY_LIMIT, DIAGNOSTIC_MONTHLY_LIMIT } from '@/lib/plans';

export { DIAGNOSTIC_DAILY_LIMIT, DIAGNOSTIC_MONTHLY_LIMIT };

/** Début du mois en cours, heure de Paris. */
export function parisMonthStart(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', timeZoneName: 'longOffset' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const offset = (parts.timeZoneName ?? 'GMT+01:00').replace('GMT', '') || '+00:00';
  return new Date(`${parts.year}-${parts.month}-01T00:00:00${offset}`);
}

export type DiagnosticQuota = { usedMonth: number; usedDay: number; limit: number; remaining: number; blocked: null | 'jour' | 'mois' };

export async function diagnosticQuota(userId: string): Promise<DiagnosticQuota> {
  const db = createServiceClient();
  const count = async (since: Date) => {
    const { count } = await db
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('feature', 'diagnostic')
      .gte('created_at', since.toISOString());
    return count ?? 0;
  };
  const [usedMonth, usedDay, { data: custom }] = await Promise.all([
    count(parisMonthStart()),
    count(new Date(Date.now() - 24 * 3600_000)),
    db.from('member_admin').select('diag_monthly_limit').eq('user_id', userId).maybeSingle(),
  ]);
  // Quota propre au membre (réglé par un admin), sinon le quota par défaut.
  const limit = custom?.diag_monthly_limit ?? DIAGNOSTIC_MONTHLY_LIMIT;
  const daily = Math.min(DIAGNOSTIC_DAILY_LIMIT, limit);
  const blocked = usedMonth >= limit ? 'mois' : usedDay >= daily ? 'jour' : null;
  return { usedMonth, usedDay, limit, remaining: Math.max(0, limit - usedMonth), blocked };
}
