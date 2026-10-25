'use server';

import { updatePrefsByToken } from '@/lib/email/preferences';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/audit';
import type { FormState } from '@/components/form-bits';

export async function savePrefs(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!rateLimit(`prefs-email:${await clientIp()}`, 20, 60 * 60_000).ok) return { error: 'Trop de tentatives. Réessayez plus tard.' };
  const ok = await updatePrefsByToken(formData.get('t'), {
    email_reminders: formData.get('email_reminders') === 'on',
    email_news: formData.get('email_news') === 'on',
  });
  return ok ? { ok: true, message: 'C’est noté, vos préférences sont enregistrées.' } : { error: 'Lien invalide ou expiré. Changez vos préférences depuis « Mon compte ».' };
}
