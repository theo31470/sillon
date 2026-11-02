'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { getMachine } from '@/lib/fleet';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import { estimateMachine, valuationQuota } from '@/lib/valuation';
import { alertAdmins, isAiBillingError } from '@/lib/email/alerts';

/** Puissance en ch tirée de la fiche technique liée (« 240 ch », « 176 kW »). */
function powerFromSheet(content: unknown): number | null {
  const specs = (content as { specs?: { items?: { label?: string; value?: string }[] }[] } | null)?.specs ?? [];
  for (const g of specs) {
    for (const it of g.items ?? []) {
      if (!/puissance/i.test(it.label ?? '')) continue;
      const ch = /(\d{2,3})\s*ch/i.exec(it.value ?? '');
      if (ch) return Number(ch[1]);
      const kw = /(\d{2,3})\s*kW/i.exec(it.value ?? '');
      if (kw) return Math.round(Number(kw[1]) * 1.36);
    }
  }
  return null;
}

export async function estimateResale(machineId: string): Promise<{ ok: true } | { error: string }> {
  const { session, profile } = await requireUser('/app/materiel');
  if (profile.plan === 'free') return { error: 'L’estimation du prix de revente est incluse dans la formule Complet.' };
  if (!z.string().uuid().safeParse(machineId).success) return { error: 'Machine introuvable.' };
  const m = await getMachine(machineId);
  if (!m || m.role !== 'owner') return { error: 'Machine introuvable.' };
  if (!m.brand || !m.model) return { error: 'Indiquez la marque et le modèle de la machine (rubrique Informations) pour l’estimer.' };
  if (!m.year) return { error: 'Indiquez l’année de la machine (rubrique Informations) pour l’estimer.' };
  if (!rateLimit(`estimation:${session.userId}`, 3, 60_000).ok) return { error: 'Un instant : une estimation est déjà en cours.' };
  const quota = await valuationQuota(session.userId);
  if (quota.remaining <= 0) return { error: `Vous avez fait vos ${quota.limit} estimations du mois. Le compteur repart à zéro le 1er.` };

  let power: number | null = null;
  if (m.sheet_id) {
    const { data } = await (await createClient()).from('tech_sheets').select('content').eq('id', m.sheet_id).maybeSingle();
    power = powerFromSheet(data?.content ?? null);
  }
  const twoYears = new Date(Date.now() - 2 * 365 * 86_400_000).toISOString().slice(0, 10);
  try {
    await estimateMachine({ userId: session.userId, machine: m, powerHp: power, logsLast2Years: m.logs.filter((l) => l.done_on >= twoYears).length });
  } catch (err) {
    console.error('[estimation]', err);
    if (isAiBillingError(err)) {
      await alertAdmins('credits-ia', 'Plus de crédit Claude : l’estimation de revente est en panne', ['L’API Claude refuse les demandes : le crédit du compte est épuisé.'], 'https://console.anthropic.com/settings/billing');
      return { error: 'L’estimation est momentanément indisponible. Réessayez plus tard.' };
    }
    return { error: err instanceof Error && err.message.startsWith('Pas assez') ? err.message : 'L’estimation n’a pas abouti. Réessayez dans un instant.' };
  }
  revalidatePath(`/app/materiel/${m.id}`);
  return { ok: true };
}
