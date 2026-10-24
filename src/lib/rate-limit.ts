import 'server-only';

/**
 * Limiteur de débit simple, en mémoire (fenêtre glissante).
 * Suffisant pour un serveur unique. Sur un hébergement à plusieurs instances
 * (Vercel…), remplacer par un stockage partagé (ex. Upstash Redis) : voir README.
 * Supabase applique en plus ses propres limites sur la connexion et l'inscription.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const retryAfterSec = Math.ceil((windowMs - (now - hits[0])) / 1000);
    buckets.set(key, hits);
    return { ok: false, retryAfterSec };
  }
  hits.push(now);
  buckets.set(key, hits);

  // Nettoyage occasionnel pour ne pas faire grossir la mémoire.
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return { ok: true, retryAfterSec: 0 };
}
