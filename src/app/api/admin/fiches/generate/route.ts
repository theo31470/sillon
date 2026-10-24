import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getAdminOrNull } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/admin';
import { generateSheet } from '@/lib/ai';
import { downloadSources, MAX_FILES } from '@/lib/sheets/sources';
import { logAudit } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { uniqueSheetSlug } from '@/lib/sheets/slug';
import { countPendingReview } from '@/lib/sheets/schema';

// La lecture de longs manuels par Claude peut prendre plusieurs minutes.
export const maxDuration = 300;

const SECTIONS = {
  specs: 'caractéristiques techniques',
  maintenance: 'plan d’entretien',
  faults: 'pannes fréquentes et vérifications',
  parts: 'pièces d’entretien et références',
} as const;

const bodySchema = z.object({
  title: z.string().trim().min(2).max(160),
  category: z.enum(['machine', 'culture', 'produit', 'panne']),
  brand: z.string().trim().max(80).default(''),
  model: z.string().trim().max(80).default(''),
  sections: z.array(z.enum(Object.keys(SECTIONS) as [keyof typeof SECTIONS, ...(keyof typeof SECTIONS)[]])).min(1),
  sources: z
    .array(z.object({ name: z.string().trim().min(1).max(120), path: z.string().max(200) }))
    .min(1, 'Ajoutez au moins un document source')
    .max(MAX_FILES),
});

export async function POST(request: NextRequest) {
  const admin = await getAdminOrNull();
  if (!admin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  if (!rateLimit(`sheetgen:${admin.session.userId}`, 20, 60 * 60_000).ok) {
    return NextResponse.json({ error: 'Limite de 20 générations par heure atteinte.' }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const input = parsed.data;

  // Vérifie la configuration AVANT de créer la fiche, pour ne pas laisser de fiche vide.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Claude n’est pas encore configuré : ajoutez ANTHROPIC_API_KEY dans les variables d’environnement (voir README).' },
      { status: 503 },
    );
  }

  const db = createServiceClient();
  const { data: sheet, error } = await db
    .from('tech_sheets')
    .insert({
      slug: await uniqueSheetSlug(input.title),
      title: input.title,
      category: input.category,
      brand: input.brand,
      model: input.model,
      sources: input.sources,
      status: 'generating',
    })
    .select('id')
    .single();
  if (error || !sheet) return NextResponse.json({ error: 'Création de la fiche impossible' }, { status: 500 });

  try {
    const pdfs = await downloadSources(input.sources);
    const { content, model } = await generateSheet({
      userId: admin.session.userId,
      title: input.title,
      category: input.category,
      brand: input.brand,
      model: input.model,
      sections: input.sections.map((s) => SECTIONS[s]),
      sources: pdfs,
    });
    await db
      .from('tech_sheets')
      .update({ content, summary: content.summary, status: 'review', ai_model: model })
      .eq('id', sheet.id);
    await logAudit(admin.session, 'fiche.generee_par_ia', { type: 'tech_sheet', id: sheet.id }, { titre: input.title, a_verifier: countPendingReview(content), modele: model });
    return NextResponse.json({ id: sheet.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error('[fiches] génération', message);
    await db.from('tech_sheets').update({ status: 'rejected', summary: `Échec de la génération : ${message}`.slice(0, 300) }).eq('id', sheet.id);
    return NextResponse.json({ error: `La génération a échoué : ${message}`, id: sheet.id }, { status: 502 });
  }
}
