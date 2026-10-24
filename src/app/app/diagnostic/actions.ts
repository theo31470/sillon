'use server';

import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { diagnose, type Diagnosis } from '@/lib/ai';
import { rateLimit } from '@/lib/rate-limit';
import { parseSheetContent } from '@/lib/sheets/schema';

export type DiagnosisState = { error?: string; result?: Diagnosis } | undefined;

const DAILY_LIMIT = 20;

export async function runDiagnosis(_prev: DiagnosisState, formData: FormData): Promise<DiagnosisState> {
  const { session, profile } = await requireUser('/app/diagnostic');
  if (profile.plan === 'free') return { error: 'L’aide au diagnostic est incluse dans la formule Complet.' };

  const parsed = z
    .object({
      machine_id: z.union([z.string().uuid(), z.literal('')]),
      description: z.string().trim().min(15, 'Décrivez le problème en quelques phrases (15 caractères minimum).').max(2000),
    })
    .safeParse({ machine_id: formData.get('machine_id') ?? '', description: formData.get('description') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Limite d'usage pour maîtriser les coûts : 20 diagnostics par jour et par compte.
  if (!rateLimit(`diag:${session.userId}`, DAILY_LIMIT, 24 * 3600_000).ok) {
    return { error: `Limite de ${DAILY_LIMIT} diagnostics par jour atteinte. Réessayez demain.` };
  }

  const supabase = await createClient();
  let machineName: string | undefined;
  let sheetContent = null;
  if (parsed.data.machine_id) {
    const { data: machine } = await supabase.from('machines').select('name, sheet_id').eq('id', parsed.data.machine_id).single();
    if (machine) {
      machineName = machine.name;
      if (machine.sheet_id) {
        const { data: sheet } = await supabase.from('tech_sheets').select('content').eq('id', machine.sheet_id).maybeSingle();
        if (sheet) sheetContent = parseSheetContent(sheet.content);
      }
    }
  }

  try {
    const result = await diagnose({ userId: session.userId, description: parsed.data.description, machineName, sheetContent });
    return { result };
  } catch (error) {
    console.error('[diagnostic]', error);
    return { error: 'Le diagnostic n’a pas pu aboutir. Réessayez dans un instant.' };
  }
}
