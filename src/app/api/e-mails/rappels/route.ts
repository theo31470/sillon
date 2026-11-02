import { after, NextResponse } from 'next/server';
import { runReminders } from '@/lib/email/reminders';
import { runInactiveNudges } from '@/lib/nudges';
import { expireComps } from '@/lib/membership';
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
      // Messages de contact : effacés 3 ans après le dernier échange (politique de confidentialité).
      const { createServiceClient } = await import('@/lib/supabase/admin');
      await createServiceClient().from('contact_messages').delete().lt('updated_at', new Date(Date.now() - 3 * 365 * 86400_000).toISOString());
      const expired = await expireComps();
      if (expired) console.info('[formules offertes] expirées :', expired);
      const r = await runReminders();
      console.info('[rappels]', r);
      // Parc de démonstration : dates et échéances remises à jour chaque jour.
      try {
        const { ensureDemoUser, seedDemo, unlockDemoUser } = await import('@/lib/demo');
        const demoId = await ensureDemoUser();
        await Promise.all([seedDemo(demoId, { force: true }), unlockDemoUser(demoId)]);
      } catch (err) {
        console.error('[démo]', err);
      }
      // Boutique : suivi des commandes en cours chez Printful (si une notification s'est perdue).
      try {
        const { printfulConfigured } = await import('@/lib/printful');
        if (printfulConfigured()) console.info('[boutique] commandes relues :', await (await import('@/lib/shop')).syncOpenShopOrders());
      } catch (err) {
        console.error('[boutique]', err);
      }
      // Bourse : versements automatiques après réception, remises jamais faites, paiements abandonnés.
      try {
        console.info('[bourse] automatique :', await (await import('@/lib/bourse-pay')).runBourseAutomation());
      } catch (err) {
        console.error('[bourse]', err);
      }
      // Relance unique des comptes gratuits restés sans visite depuis 14 jours.
      if (!r.skipped) console.info('[relances] inactifs :', await runInactiveNudges());
    } catch (err) {
      console.error('[rappels]', err);
    }
  });
  return NextResponse.json({ ok: true });
}
