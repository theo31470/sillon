'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/email/send';
import { fleetInviteEmail } from '@/lib/email/templates';
import { FLEET_COOKIE, FLEET_GUESTS_LIMIT, getFleetAccess, ROLE_LABELS } from '@/lib/fleet-access';
import type { FormState } from '@/components/form-bits';

const roleSchema = z.enum(['collaborateur', 'lecture']);

/** Le titulaire (formule Complet) invite une personne sur son parc. */
export async function inviteMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, profile } = await requireUser('/app/equipe');
  if (profile.plan === 'free') return { error: 'Le partage du parc est inclus dans la formule Complet.' };
  if (!rateLimit(`equipe:${session.userId}`, 10, 60 * 60_000).ok) return { error: 'Trop d’invitations en peu de temps : réessayez plus tard.' };
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.').max(320), role: roleSchema })
    .safeParse({ email: formData.get('email') ?? '', role: formData.get('role') ?? 'collaborateur' });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invitation invalide.' };
  if (parsed.data.email === profile.email.toLowerCase()) return { error: 'C’est votre propre adresse.' };

  const db = createServiceClient();
  const { count } = await db.from('fleet_members').select('id', { count: 'exact', head: true }).eq('owner_id', session.userId);
  if ((count ?? 0) >= FLEET_GUESTS_LIMIT) return { error: `La formule Complet permet d’inviter ${FLEET_GUESTS_LIMIT} personnes. Retirez-en une pour en inviter une autre.` };

  const { data: invite, error } = await db
    .from('fleet_members')
    .insert({ owner_id: session.userId, email: parsed.data.email, role: parsed.data.role })
    .select('id, token')
    .single();
  if (error?.code === '23505') return { error: 'Cette personne est déjà invitée.' };
  if (error || !invite) return { error: 'Invitation impossible pour le moment.' };

  const site = env.siteUrl().replace(/\/$/, '');
  const res = await sendEmail(
    {
      to: parsed.data.email,
      email: fleetInviteEmail({ from: profile.farm_name || profile.full_name || profile.email, role: ROLE_LABELS[parsed.data.role], url: `${site}/invitation/${invite.token}` }, site),
      kind: 'compte',
      template: 'invitation_parc',
    },
    { idempotencyKey: `invitation-parc-${invite.id}` },
  );
  await logAudit(session, 'equipe.invitation', { type: 'fleet_member', id: invite.id as string }, { role: parsed.data.role });
  revalidatePath('/app/equipe');
  return res.ok
    ? { ok: true, message: `Invitation envoyée à ${parsed.data.email}.` }
    : { ok: true, message: `Invitation créée, mais l’e-mail n’est pas parti. Envoyez-lui ce lien : ${site}/invitation/${invite.token}` };
}

const idSchema = z.string().uuid();

export async function changeMemberRole(formData: FormData) {
  const { session } = await requireUser('/app/equipe');
  const id = idSchema.safeParse(formData.get('id'));
  const role = roleSchema.safeParse(formData.get('role'));
  if (!id.success || !role.success) return;
  await createServiceClient().from('fleet_members').update({ role: role.data }).eq('id', id.data).eq('owner_id', session.userId);
  await logAudit(session, 'equipe.role', { type: 'fleet_member', id: id.data }, { role: role.data });
  revalidatePath('/app/equipe');
}

/** Le titulaire retire un accès (ou annule une invitation). */
export async function removeMember(formData: FormData) {
  const { session } = await requireUser('/app/equipe');
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return;
  await createServiceClient().from('fleet_members').delete().eq('id', id.data).eq('owner_id', session.userId);
  await logAudit(session, 'equipe.retrait', { type: 'fleet_member', id: id.data });
  revalidatePath('/app/equipe');
}

/** Un invité quitte un parc partagé. */
export async function leaveFleet(formData: FormData) {
  const { session } = await requireUser('/app/equipe');
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return;
  await createServiceClient().from('fleet_members').delete().eq('id', id.data).eq('member_id', session.userId);
  (await cookies()).delete(FLEET_COOKIE);
  revalidatePath('/app', 'layout');
}

/** Choix du parc affiché (le sien ou un parc partagé). */
export async function switchFleet(formData: FormData) {
  const access = await getFleetAccess();
  if (!access) redirect('/connexion');
  const owner = String(formData.get('owner') ?? '');
  const target = access.fleets.find((f) => f.ownerId === owner);
  const jar = await cookies();
  if (!target || target.role === 'owner') jar.delete(FLEET_COOKIE);
  else jar.set(FLEET_COOKIE, target.ownerId, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 365 * 86400 });
  revalidatePath('/app', 'layout');
  redirect('/app/materiel');
}

/** Acceptation d'une invitation par la personne connectée (lien reçu par e-mail). */
export async function acceptInvite(formData: FormData) {
  const token = idSchema.safeParse(formData.get('token'));
  if (!token.success) redirect('/app');
  const { session } = await requireUser(`/invitation/${token.data}`);
  const db = createServiceClient();
  const { data: invite } = await db.from('fleet_members').select('id, owner_id, status').eq('token', token.data).maybeSingle();
  if (!invite || invite.status !== 'invitation' || invite.owner_id === session.userId) redirect('/app/equipe?invitation=invalide');
  const { error } = await db
    .from('fleet_members')
    .update({ member_id: session.userId, status: 'actif', token: null, accepted_at: new Date().toISOString() })
    .eq('id', invite.id)
    .eq('status', 'invitation');
  if (error) redirect(`/app/equipe?invitation=${error.code === '23505' ? 'deja' : 'invalide'}`);
  await logAudit(session, 'equipe.acceptation', { type: 'fleet_member', id: invite.id as string });
  (await cookies()).set(FLEET_COOKIE, invite.owner_id as string, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 365 * 86400 });
  revalidatePath('/app', 'layout');
  redirect('/app/materiel?parc=partage');
}
