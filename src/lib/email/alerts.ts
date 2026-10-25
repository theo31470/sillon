import 'server-only';
import { createServiceClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { renderEmail } from '@/lib/email/layout';
import { sendEmail } from '@/lib/email/send';

/**
 * Alerte aux administrateurs (ex. plus de crédit Claude). Au plus une alerte
 * du même type toutes les 6 heures, pour ne pas inonder la boîte.
 */
export async function alertAdmins(key: string, subject: string, lines: string[], actionUrl?: string) {
  try {
    const db = createServiceClient();
    const template = `alerte_${key}`.slice(0, 60);
    const since = new Date(Date.now() - 6 * 3600_000).toISOString();
    const { count } = await db.from('email_log').select('id', { count: 'exact', head: true }).eq('template', template).gte('created_at', since);
    if (count) return;
    const { data: admins } = await db.from('profiles').select('id, email').eq('role', 'admin').eq('suspended', false);
    const site = env.siteUrl();
    for (const a of admins ?? []) {
      if (!a.email) continue;
      const rendered = renderEmail(
        {
          preheader: lines[0] ?? subject,
          heading: subject,
          blocks: [
            ...lines.map((text) => ({ type: 'p' as const, text })),
            ...(actionUrl ? [{ type: 'button' as const, label: 'Régler le problème', url: actionUrl }] : []),
          ],
          reason: 'Alerte automatique envoyée aux administrateurs de Tracteurs & Co (au plus une toutes les 6 heures).',
        },
        { siteUrl: site },
      );
      await sendEmail({ to: a.email, email: { subject: `[Alerte] ${subject}`, ...rendered }, kind: 'compte', template, userId: a.id });
    }
  } catch (err) {
    console.error('[alerte]', key, err);
  }
}

/** L'API Claude refuse faute de crédit ou de quota. */
export const isAiBillingError = (error: unknown) =>
  /credit balance|billing|insufficient|quota|spend limit/i.test(error instanceof Error ? error.message : String(error));
