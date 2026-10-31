import 'server-only';
import { createServiceClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/email/send';
import { sheetReadyEmail } from '@/lib/email/templates';

export const REQUEST_STATUSES = {
  nouvelle: 'Reçue',
  lancee: 'En préparation',
  publiee: 'En ligne',
  refusee: 'Pas possible',
} as const;
export type RequestStatus = keyof typeof REQUEST_STATUSES;

export type SheetRequest = {
  id: string;
  user_id: string;
  brand: string;
  model: string;
  details: string;
  status: RequestStatus;
  catalog_model_id: string | null;
  sheet_id: string | null;
  admin_note: string;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Nombre de demandes en cours qu'un membre peut avoir en même temps. */
export const OPEN_REQUESTS_LIMIT = 5;

/**
 * Une fiche vient d'être publiée : on prévient chaque membre qui l'avait demandée
 * (une seule fois), et sa demande passe « En ligne ».
 */
export async function notifySheetRequesters(sheetId: string) {
  const db = createServiceClient();
  const { data: sheet } = await db.from('tech_sheets').select('id, title, slug, status').eq('id', sheetId).maybeSingle();
  if (!sheet || sheet.status !== 'published') return 0;
  const { data: models } = await db.from('catalog_models').select('id').eq('sheet_id', sheetId);
  const modelIds = (models ?? []).map((m) => m.id as string);

  let q = db.from('sheet_requests').select('id, user_id').is('notified_at', null).in('status', ['nouvelle', 'lancee']);
  q = modelIds.length ? q.or(`sheet_id.eq.${sheetId},catalog_model_id.in.(${modelIds.join(',')})`) : q.eq('sheet_id', sheetId);
  const { data: requests } = await q;
  if (!requests?.length) return 0;

  const url = `${env.siteUrl().replace(/\/$/, '')}/fiches/${sheet.slug}`;
  let sent = 0;
  for (const r of requests) {
    // Marquée avant l'envoi : jamais deux e-mails pour la même demande.
    const { data: claimed } = await db
      .from('sheet_requests')
      .update({ status: 'publiee', sheet_id: sheetId, notified_at: new Date().toISOString() })
      .eq('id', r.id)
      .is('notified_at', null)
      .select('id');
    if (!claimed?.length) continue;
    const { data: p } = await db.from('profiles').select('email, full_name').eq('id', r.user_id).maybeSingle();
    if (!p?.email) continue;
    const res = await sendEmail(
      { to: p.email as string, email: sheetReadyEmail({ name: p.full_name as string | null, title: sheet.title as string, url }, env.siteUrl()), kind: 'message', template: 'fiche_demandee_en_ligne', userId: r.user_id as string },
      { idempotencyKey: `fiche-demandee-${r.id}` },
    );
    if (res.ok) sent++;
  }
  return sent;
}
