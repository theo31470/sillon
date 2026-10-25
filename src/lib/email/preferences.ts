import 'server-only';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/admin';
import type { EmailList } from '@/lib/email/send';

/**
 * Préférences d'e-mail modifiables SANS connexion, grâce au jeton présent
 * dans les liens des e-mails. Le jeton ne donne accès qu'à ces deux cases.
 */

const tokenSchema = z.string().uuid();

export type EmailPrefs = { email: string; email_reminders: boolean; email_news: boolean };

export async function prefsByToken(token: unknown): Promise<EmailPrefs | null> {
  const t = tokenSchema.safeParse(token);
  if (!t.success) return null;
  const { data } = await createServiceClient().from('profiles').select('email, email_reminders, email_news').eq('email_token', t.data).maybeSingle();
  return (data as EmailPrefs | null) ?? null;
}

export async function updatePrefsByToken(token: unknown, prefs: Partial<Pick<EmailPrefs, 'email_reminders' | 'email_news'>>) {
  const t = tokenSchema.safeParse(token);
  if (!t.success) return false;
  const { data, error } = await createServiceClient().from('profiles').update(prefs).eq('email_token', t.data).select('id');
  return !error && (data?.length ?? 0) === 1;
}

export const LIST_COLUMN: Record<EmailList, 'email_reminders' | 'email_news'> = { rappels: 'email_reminders', annonces: 'email_news' };

/** « theo@exemple.fr » → « t•••@exemple.fr » */
export function maskEmail(email: string) {
  const [user, domain] = email.split('@');
  if (!domain) return '•••';
  return `${user.slice(0, 1)}•••@${domain}`;
}
