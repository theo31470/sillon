import { after, NextResponse } from 'next/server';
import { processNextJob } from '@/lib/catalog';
import { rateLimit } from '@/lib/rate-limit';

// Une étape (recherche web ou rédaction) peut prendre plusieurs minutes.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * « Réveil » de la file d'import des fiches, appelé chaque minute par la base
 * (pg_cron, voir supabase/cron.sql) et par le bouton « Lancer maintenant ».
 *
 * Sans authentification volontairement : cette route ne fait qu'avancer le
 * travail déjà validé par un administrateur (modèles mis en file), avec au plus
 * 3 étapes en parallèle et un plafond de recherches par jour. Elle ne renvoie
 * aucune donnée.
 */
export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false }, { status: 503 });
  if (!rateLimit('catalogue-tick', 20, 60_000).ok) return NextResponse.json({ ok: false }, { status: 429 });
  // On répond tout de suite ; le travail continue en arrière-plan (jusqu'à maxDuration).
  after(async () => {
    try {
      await processNextJob();
    } catch (err) {
      console.error('[catalogue] tick', err);
    }
  });
  return NextResponse.json({ ok: true });
}
