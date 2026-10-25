import { after, NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { safeNext } from '@/lib/safe-redirect';
import { verifyStandardWebhook } from '@/lib/email/webhook';
import { authEmail, type AuthTemplate } from '@/lib/email/templates';
import { logSend, sendOnly, type OutgoingEmail, type SendResult } from '@/lib/email/send';

export const dynamic = 'force-dynamic';

/**
 * « Send Email Hook » de Supabase Auth : à chaque e-mail de compte
 * (inscription, mot de passe oublié, changement d'adresse, alertes…),
 * Supabase appelle cette route au lieu d'envoyer son propre e-mail.
 * On construit le message aux couleurs de Tracteurs & Co et on l'envoie
 * par Resend. La signature est vérifiée : seul Supabase peut l'appeler.
 */

const payloadSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().default(''),
    new_email: z.string().optional().nullable(),
    user_metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  }),
  email_data: z.object({
    token: z.string().default(''),
    token_hash: z.string().default(''),
    redirect_to: z.string().default(''),
    email_action_type: z.string(),
    site_url: z.string().default(''),
    token_new: z.string().default(''),
    token_hash_new: z.string().default(''),
    old_email: z.string().optional().nullable(),
  }),
});

const DEFAULT_NEXT: Record<string, string> = { recovery: '/app/compte', invite: '/app/compte', email_change: '/app/compte' };

function confirmUrl(tokenHash: string, type: string, redirectTo: string) {
  const site = env.siteUrl().replace(/\/$/, '');
  let next = DEFAULT_NEXT[type] ?? '/app';
  try {
    const r = new URL(redirectTo);
    if (r.origin === new URL(site).origin) {
      const suite = r.searchParams.get('suite') ?? (r.pathname !== '/' && r.pathname !== '/auth/confirm' ? r.pathname : null);
      if (suite) next = safeNext(suite, next);
    }
  } catch {
    // redirect_to absent ou invalide : destination par défaut.
  }
  const q = new URLSearchParams({ token_hash: tokenHash, type, suite: next });
  return `${site}/auth/confirm?${q}`;
}

const fail = (status: number, message: string) => NextResponse.json({ error: { http_code: status, message } }, { status });

export async function POST(request: NextRequest) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET;
  if (!secret) return fail(500, 'Hook d’envoi non configuré (SEND_EMAIL_HOOK_SECRET absent).');

  const body = await request.text();
  const check = verifyStandardWebhook(body, request.headers, secret);
  if (!check.ok) return fail(401, `Signature refusée : ${check.reason}`);

  let parsed: z.infer<typeof payloadSchema>;
  try {
    parsed = payloadSchema.parse(JSON.parse(body));
  } catch {
    return fail(400, 'Contenu illisible.');
  }
  const { user, email_data: d } = parsed;
  const site = env.siteUrl();
  const name = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null;
  const action = d.email_action_type;

  const messages: { to: string; template: AuthTemplate; url?: string; code?: string; newEmail?: string }[] = [];
  switch (action) {
    case 'signup':
    case 'recovery':
    case 'magiclink':
    case 'invite':
      messages.push({ to: user.email, template: action, url: confirmUrl(d.token_hash, action, d.redirect_to) });
      break;
    case 'email':
      // Code de connexion à usage unique : même présentation que le lien magique.
      messages.push({ to: user.email, template: 'magiclink', url: confirmUrl(d.token_hash, 'email', d.redirect_to) });
      break;
    case 'email_change': {
      const newEmail = user.new_email ?? '';
      if (d.token_hash && d.token_hash_new) {
        // Changement sécurisé : confirmation sur l'ancienne ET la nouvelle adresse.
        // (Noms de champs inversés côté Supabase, voir leur documentation.)
        messages.push({ to: user.email, template: 'email_change_current', url: confirmUrl(d.token_hash_new, 'email_change', d.redirect_to), newEmail });
        if (newEmail) messages.push({ to: newEmail, template: 'email_change_new', url: confirmUrl(d.token_hash, 'email_change', d.redirect_to), newEmail });
      } else if (newEmail) {
        messages.push({ to: newEmail, template: 'email_change_new', url: confirmUrl(d.token_hash || d.token_hash_new, 'email_change', d.redirect_to), newEmail });
      }
      break;
    }
    case 'reauthentication':
      messages.push({ to: user.email, template: 'reauthentication', code: d.token });
      break;
    case 'email_changed_notification':
      // L'alerte part sur l'ANCIENNE adresse : c'est elle qu'il faut prévenir.
      messages.push({ to: d.old_email || user.email, template: 'email_changed_notification', newEmail: user.email });
      break;
    case 'password_changed_notification':
    case 'mfa_factor_enrolled_notification':
    case 'mfa_factor_unenrolled_notification':
    case 'identity_linked_notification':
    case 'identity_unlinked_notification':
    case 'phone_changed_notification':
      messages.push({ to: user.email, template: action });
      break;
    default:
      console.warn('[email-hook] type inconnu, ignoré :', action);
      return NextResponse.json({});
  }

  const webhookId = request.headers.get('webhook-id') ?? '';
  const outgoing: OutgoingEmail[] = messages
    .filter((m) => m.to)
    .map((m) => ({
      to: m.to,
      email: authEmail(m.template, { name, url: m.url, code: m.code, newEmail: m.newEmail }, site),
      kind: 'compte',
      template: m.template,
      userId: user.id,
    }));

  const results: SendResult[] = await Promise.all(outgoing.map((m, i) => sendOnly(m, { idempotencyKey: webhookId ? `auth-${webhookId}-${i}` : undefined })));
  // Le journal s'écrit après la réponse : Supabase n'attend que quelques secondes.
  after(() => Promise.all(outgoing.map((m, i) => logSend(m, results[i]))));

  const failed = results.find((r) => !r.ok);
  if (failed && !failed.ok) {
    console.error('[email-hook] envoi impossible', action, failed.error);
    return fail(500, 'L’e-mail n’a pas pu être envoyé. Réessayez dans quelques minutes.');
  }
  return NextResponse.json({});
}
