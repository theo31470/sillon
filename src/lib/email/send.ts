import 'server-only';
import { createServiceClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import type { BuiltEmail } from '@/lib/email/templates';

/**
 * Envoi des e-mails par Resend (https://resend.com), via son API HTTP :
 * aucune dépendance à installer. Chaque envoi est noté dans le journal
 * `email_log` (lisible dans l'admin, rubrique E-mails).
 */

export type EmailKind = 'compte' | 'rappel' | 'annonce' | 'test';
export type EmailList = 'rappels' | 'annonces';

export type OutgoingEmail = {
  to: string;
  email: BuiltEmail;
  kind: EmailKind;
  template: string;
  userId?: string | null;
  campaignId?: string | null;
  /** Ajoute les en-têtes de désinscription en un clic (rappels, annonces). */
  unsubscribe?: { token: string; list: EmailList };
};

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

// RESEND_API_URL : uniquement pour les tests locaux (faux serveur Resend).
const resendUrl = () => process.env.RESEND_API_URL || 'https://api.resend.com';
const DEFAULT_FROM = 'Tracteurs & Co <onboarding@resend.dev>';

export function emailSettings() {
  const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
  return {
    apiKeySet: Boolean(process.env.RESEND_API_KEY),
    hookSecretSet: Boolean(process.env.SEND_EMAIL_HOOK_SECRET),
    from,
    replyTo: process.env.EMAIL_REPLY_TO?.trim() || null,
    /** Adresse d'essai de Resend : n'envoie qu'au propriétaire du compte Resend. */
    testSender: from.includes('@resend.dev'),
  };
}

export function preferencesUrl(token: string) {
  return `${env.siteUrl().replace(/\/$/, '')}/preferences-e-mail?t=${token}`;
}

export function unsubscribeUrl(token: string, list: EmailList) {
  return `${env.siteUrl().replace(/\/$/, '')}/api/e-mails/desinscription?t=${token}&liste=${list}`;
}

function payload(m: OutgoingEmail) {
  const s = emailSettings();
  const headers: Record<string, string> = {};
  if (m.unsubscribe) {
    headers['List-Unsubscribe'] = `<${unsubscribeUrl(m.unsubscribe.token, m.unsubscribe.list)}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  return {
    from: s.from,
    to: [m.to],
    subject: m.email.subject,
    html: m.email.html,
    text: m.email.text,
    ...(s.replyTo ? { reply_to: s.replyTo } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
    tags: [
      { name: 'type', value: m.kind },
      { name: 'modele', value: m.template.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256) },
    ],
  };
}

async function callResend(path: string, body: unknown, idempotencyKey?: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false as const, error: 'Service d’envoi non configuré (clé RESEND_API_KEY absente).' };
  try {
    const res = await fetch(`${resendUrl()}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'User-Agent': 'TracteursEtCo/1.0',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => null)) as { id?: string; data?: { id: string }[]; message?: string } | null;
    if (!res.ok) return { ok: false as const, error: `Resend ${res.status} : ${json?.message ?? res.statusText}`.slice(0, 500) };
    return { ok: true as const, json };
  } catch (err) {
    return { ok: false as const, error: `Resend injoignable : ${err instanceof Error ? err.message : String(err)}`.slice(0, 500) };
  }
}

type LogRow = {
  user_id: string | null;
  to_email: string;
  kind: EmailKind;
  template: string;
  subject: string;
  status: 'sent' | 'failed';
  provider_id: string | null;
  error: string | null;
  campaign_id: string | null;
};

async function writeLog(rows: LogRow[]) {
  if (!rows.length) return;
  try {
    const db = createServiceClient();
    const { error } = await db.from('email_log').insert(rows);
    // Profil pas encore visible (inscription en cours) : on garde la trace sans le lien.
    if (error?.code === '23503') await db.from('email_log').insert(rows.map((r) => ({ ...r, user_id: null })));
    else if (error) console.error('[email] journal', error.message);
  } catch (err) {
    console.error('[email] journal', err);
  }
}

const logRow = (m: OutgoingEmail, r: SendResult): LogRow => ({
  user_id: m.userId ?? null,
  to_email: m.to,
  kind: m.kind,
  template: m.template,
  subject: m.email.subject.slice(0, 300),
  status: r.ok ? 'sent' : 'failed',
  provider_id: r.ok ? r.id : null,
  error: r.ok ? null : r.error,
  campaign_id: m.campaignId ?? null,
});

/** Envoie un e-mail et le note dans le journal. */
export async function sendEmail(m: OutgoingEmail, opts: { idempotencyKey?: string } = {}): Promise<SendResult> {
  const r = await sendOnly(m, opts);
  await writeLog([logRow(m, r)]);
  return r;
}

/** Envoie sans écrire le journal (le hook d'auth répond d'abord, journalise ensuite). */
export async function sendOnly(m: OutgoingEmail, opts: { idempotencyKey?: string } = {}): Promise<SendResult> {
  const res = await callResend('/emails', payload(m), opts.idempotencyKey);
  return res.ok ? { ok: true, id: res.json?.id ?? null } : { ok: false, error: res.error };
}

export async function logSend(m: OutgoingEmail, r: SendResult) {
  await writeLog([logRow(m, r)]);
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Envoi groupé (annonces, rappels) : par paquets de 100, avec une pause
 * entre les paquets pour rester sous la limite de débit de Resend.
 */
export async function sendMany(messages: OutgoingEmail[], opts: { idempotencyPrefix?: string } = {}) {
  let sent = 0;
  let failed = 0;
  const all: SendResult[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    if (i > 0) await pause(700);
    const res = await callResend('/emails/batch', chunk.map(payload), opts.idempotencyPrefix ? `${opts.idempotencyPrefix}-${i / 100}` : undefined);
    const results: SendResult[] = chunk.map((_, j) => (res.ok ? { ok: true, id: res.json?.data?.[j]?.id ?? null } : { ok: false, error: res.error }));
    await writeLog(chunk.map((m, j) => logRow(m, results[j])));
    for (const r of results) {
      if (r.ok) sent++;
      else failed++;
      all.push(r);
    }
  }
  return { sent, failed, results: all };
}
