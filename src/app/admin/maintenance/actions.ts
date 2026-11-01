'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { parisLocalToIso, setMaintenance } from '@/lib/maintenance-server';
import type { FormState } from '@/components/form-bits';

export async function saveMaintenance(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/maintenance');
  const parsed = z
    .object({ message: z.string().trim().max(400, '400 caractères au maximum.'), until: z.string().trim() })
    .safeParse({ message: formData.get('message') ?? '', until: formData.get('until') ?? '' });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Champs invalides.' };
  const active = formData.get('op') === 'activer' ? true : formData.get('op') === 'desactiver' ? false : formData.get('active') === 'on';
  const until = parsed.data.until ? parisLocalToIso(parsed.data.until) : null;
  if (parsed.data.until && !until) return { error: 'Heure de retour invalide.' };
  try {
    await setMaintenance({ active, message: parsed.data.message, until }, session.userId);
  } catch {
    return { error: 'Enregistrement impossible. Réessayez.' };
  }
  await logAudit(session, active ? 'maintenance.activee' : 'maintenance.desactivee', undefined, { message: parsed.data.message.slice(0, 120), retour: until });
  revalidatePath('/admin', 'layout');
  return {
    ok: true,
    message: active
      ? 'Mode maintenance activé : les visiteurs voient la page de maintenance d’ici 15 secondes. Vous, en tant qu’administrateur, continuez de voir le site.'
      : 'Site rouvert : les visiteurs retrouvent le site d’ici 15 secondes (la page de maintenance se recharge toute seule).',
  };
}
