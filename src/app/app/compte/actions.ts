'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { stripe } from '@/lib/stripe';
import type { FormState } from '@/components/form-bits';

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireUser('/app/compte');
  const parsed = z
    .object({
      full_name: z.string().trim().min(2, 'Nom trop court').max(120),
      farm_name: z.string().trim().max(120),
    })
    .safeParse({
      full_name: formData.get('full_name'),
      farm_name: formData.get('farm_name') ?? '',
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update(parsed.data).eq('id', session.userId);
  if (error) return { error: 'Enregistrement impossible.' };
  revalidatePath('/app', 'layout');
  return { ok: true, message: 'Informations enregistrées.' };
}

/** Suppression du compte par l'exploitant lui-même (droit à l'effacement). */
export async function deleteOwnAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, profile } = await requireUser('/app/compte');
  if (formData.get('confirm') !== 'SUPPRIMER') return { error: 'Tapez SUPPRIMER en majuscules pour confirmer.' };
  if (profile.role === 'admin') return { error: 'Un administrateur ne peut pas supprimer son propre compte ici.' };

  // 1. Résilier les abonnements Stripe en cours pour ne plus facturer.
  if (profile.stripe_customer_id) {
    try {
      const subs = await stripe().subscriptions.list({ customer: profile.stripe_customer_id, status: 'all', limit: 20 });
      for (const sub of subs.data.filter((s) => s.status !== 'canceled')) {
        await stripe().subscriptions.cancel(sub.id);
      }
    } catch (error) {
      console.error('[compte] résiliation Stripe', error);
      return { error: 'Impossible de résilier votre abonnement pour le moment. Réessayez ou contactez-nous.' };
    }
  }

  // 2. Journal, puis suppression (les données liées sont supprimées en cascade).
  await logAudit(session, 'compte.suppression_par_le_membre', { type: 'profile', id: session.userId });
  const { error } = await createServiceClient().auth.admin.deleteUser(session.userId);
  if (error) return { error: 'La suppression a échoué. Contactez-nous.' };

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/?compte=supprime');
}
