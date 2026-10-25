import { after, NextResponse } from 'next/server';
import { runReminders } from '@/lib/email/reminders';
import { rateLimit } from '@/lib/rate-limit';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Tournée quotidienne des rappels d'entretien, déclenchée chaque matin par
 * la base (pg_cron, voir supabase/cron.sql).
 *
 * Sans authentification volontairement : la tournée ne peut avoir lieu
 * qu'une fois par jour (verrou en base) et chaque échéance n'est signalée
 * qu'une fois. Un appel en trop ne fait donc rien. Aucune donnée renvoyée.
 */
export async function POST() {
  if (!rateLimit('rappels-tick', 3, 60 * 60_000).ok) return NextResponse.json({ ok: false }, { status: 429 });
  after(async () => {
    try {
      const r = await runReminders();
      console.info('[rappels]', r);
    } catch (err) {
      console.error('[rappels]', err);
    }
  });
  return NextResponse.json({ ok: true });
}
