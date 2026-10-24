import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';

/**
 * Couche d'accès aux données (DAL) : toutes les pages et actions protégées
 * passent par ces fonctions. Elles vérifient la session côté serveur à chaque
 * requête (le proxy ne fait qu'une vérification rapide).
 */

export type Session = {
  userId: string;
  email: string;
  aal: string;
  /** Horodatage (secondes) du dernier code de double authentification validé. */
  lastMfaAt: number | null;
};

export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const claims = data.claims;

  let lastMfaAt: number | null = null;
  for (const entry of claims.amr ?? []) {
    if (typeof entry === 'object' && entry.method === 'totp') {
      lastMfaAt = Math.max(lastMfaAt ?? 0, entry.timestamp);
    }
  }

  return {
    userId: claims.sub,
    email: claims.email ?? '',
    aal: (claims.aal as string) ?? 'aal1',
    lastMfaAt,
  };
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const session = await getSession();
  if (!session) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('*').eq('id', session.userId).single();
  return (data as Profile | null) ?? null;
});

/** Exige un exploitant connecté et non suspendu. */
export async function requireUser(next = '/app') {
  const session = await getSession();
  if (!session) redirect(`/connexion?suite=${encodeURIComponent(next)}`);
  const profile = await getProfile();
  if (!profile) redirect(`/connexion?suite=${encodeURIComponent(next)}`);
  if (profile.suspended) redirect('/compte-suspendu');

  // Un membre qui a activé la double authentification doit saisir son code.
  if (session.aal !== 'aal2') {
    const supabase = await createClient();
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.nextLevel === 'aal2') redirect(`/securite/2fa?suite=${encodeURIComponent(next)}`);
  }
  return { session, profile };
}

/** Exige un administrateur connecté AVEC double authentification. */
export async function requireAdmin(next = '/admin') {
  const { session, profile } = await requireUser(next);
  if (profile.role !== 'admin') redirect('/app');
  if (session.aal !== 'aal2') redirect(`/securite/2fa?suite=${encodeURIComponent(next)}`);
  return { session, profile };
}

/** Variante sans redirection, pour les routes API : null si l'appelant n'est pas admin en 2FA. */
export async function getAdminOrNull() {
  const session = await getSession();
  if (!session || session.aal !== 'aal2') return null;
  const profile = await getProfile();
  if (!profile || profile.role !== 'admin' || profile.suspended) return null;
  return { session, profile };
}

/**
 * Pour les actions sensibles (suspension, suppression, export de données) :
 * le code de double authentification doit avoir été saisi récemment.
 */
export function hasRecentMfa(session: Session, maxAgeMinutes = 15) {
  if (!session.lastMfaAt) return false;
  return Date.now() / 1000 - session.lastMfaAt <= maxAgeMinutes * 60;
}
