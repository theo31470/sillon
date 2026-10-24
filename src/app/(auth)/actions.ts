'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { pwnedPasswordError } from '@/lib/pwned';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp, logAudit } from '@/lib/audit';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { safeNext } from '@/lib/safe-redirect';
import type { FormState } from '@/components/form-bits';

const emailSchema = z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(200);
const passwordSchema = z
  .string()
  .min(10, 'Le mot de passe doit faire au moins 10 caractères')
  .max(128, 'Mot de passe trop long')
  // Mêmes règles que dans Supabase (Authentication → Email → Password requirements).
  .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre');

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1, 'Mot de passe requis').max(128) })
    .safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const ip = await clientIp();
  const limit = rateLimit(`login:${ip}:${parsed.data.email}`, 5, 15 * 60_000);
  if (!limit.ok) {
    return { error: `Trop de tentatives. Réessayez dans ${Math.ceil(limit.retryAfterSec / 60)} min.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Message volontairement vague : on ne révèle pas si le compte existe.
    return { error: 'E-mail ou mot de passe incorrect.' };
  }

  const session = await getSession();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', session?.userId ?? '').single();
  if (profile?.role === 'admin') {
    await logAudit(session, 'admin.connexion_mot_de_passe');
  }

  redirect(safeNext(formData.get('suite')));
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({
      full_name: z.string().trim().min(2, 'Indiquez votre nom').max(120),
      farm_name: z.string().trim().min(2, 'Indiquez le nom de votre exploitation').max(120),
      email: emailSchema,
      password: passwordSchema,
      consent: z.literal('on', { error: 'Merci d’accepter les conditions d’utilisation' }),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const ip = await clientIp();
  if (!rateLimit(`signup:${ip}`, 5, 60 * 60_000).ok) {
    return { error: 'Trop d’inscriptions depuis cette connexion. Réessayez plus tard.' };
  }
  const leaked = await pwnedPasswordError(parsed.data.password);
  if (leaked) return { error: leaked };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name, farm_name: parsed.data.farm_name },
      emailRedirectTo: `${env.siteUrl()}/auth/confirm?suite=/app`,
    },
  });
  if (error) {
    if (error.code === 'weak_password') return { error: 'Mot de passe trop faible : 10 caractères minimum, avec majuscule, minuscule et chiffre.' };
    return { error: 'Inscription impossible pour le moment. Réessayez dans quelques minutes.' };
  }
  return { ok: true, message: 'Presque fini ! Ouvrez l’e-mail que nous venons de vous envoyer pour activer votre compte.' };
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get('email'));
  if (!parsed.success) return { error: 'Adresse e-mail invalide' };

  const ip = await clientIp();
  if (rateLimit(`reset:${ip}`, 5, 60 * 60_000).ok) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${env.siteUrl()}/auth/confirm?suite=/app/compte`,
    });
  }
  // Même réponse dans tous les cas : on ne révèle pas si le compte existe.
  return { ok: true, message: 'Si un compte existe avec cette adresse, vous allez recevoir un lien de réinitialisation.' };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) redirect('/connexion');

  const parsed = z
    .object({ password: passwordSchema, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: 'Les deux mots de passe ne correspondent pas' })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const leaked = await pwnedPasswordError(parsed.data.password);
  if (leaked) return { error: leaked };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === 'insufficient_aal') return { error: 'Validez d’abord votre code de double authentification.' };
    if (error.code === 'weak_password') return { error: 'Mot de passe trop faible : 10 caractères minimum, avec majuscule, minuscule et chiffre.' };
    if (error.code === 'same_password') return { error: 'Choisissez un mot de passe différent de l’actuel.' };
    return { error: 'Impossible de changer le mot de passe. Choisissez-en un autre.' };
  }
  await logAudit(session, 'compte.mot_de_passe_modifie');
  return { ok: true, message: 'Mot de passe mis à jour.' };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
