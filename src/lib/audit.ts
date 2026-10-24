import 'server-only';
import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/admin';
import type { Session } from '@/lib/auth';

/** Adresse IP du client (derrière un hébergeur type Vercel). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'inconnue';
}

/**
 * Enregistre une action dans le journal d'activité.
 * Écrit avec la clé serveur : aucun utilisateur ne peut falsifier le journal.
 */
export async function logAudit(
  actor: Session | null,
  action: string,
  target?: { type: string; id: string },
  details: Record<string, unknown> = {},
) {
  try {
    const supabase = createServiceClient();
    await supabase.from('audit_log').insert({
      actor_id: actor?.userId ?? null,
      actor_email: actor?.email ?? null,
      action,
      target_type: target?.type ?? null,
      target_id: target?.id ?? null,
      details,
      ip: await clientIp(),
    });
  } catch (error) {
    // Le journal ne doit jamais bloquer l'action, mais l'échec doit se voir.
    console.error('[audit] échec de l’écriture du journal', action, error);
  }
}
