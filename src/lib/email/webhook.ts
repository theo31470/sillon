import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Vérification de la signature « Standard Webhooks » utilisée par les hooks
 * de Supabase Auth. Sans signature valide, la requête est refusée : personne
 * d'autre que Supabase ne peut faire envoyer un e-mail par cette route.
 *
 * Secret attendu : « v1,whsec_<base64> » (tel que copié depuis Supabase).
 */
export function verifyStandardWebhook(
  body: string,
  headers: Headers,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): { ok: true } | { ok: false; reason: string } {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatures = headers.get('webhook-signature');
  if (!id || !timestamp || !signatures) return { ok: false, reason: 'en-têtes manquants' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 5 * 60) return { ok: false, reason: 'horodatage hors délai' };

  const raw = secret.trim().replace(/^v1,/, '').replace(/^whsec_/, '');
  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    return { ok: false, reason: 'secret illisible' };
  }
  if (key.length === 0) return { ok: false, reason: 'secret vide' };

  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  for (const part of signatures.split(' ')) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    const given = Buffer.from(sig, 'base64');
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true };
  }
  return { ok: false, reason: 'signature invalide' };
}
