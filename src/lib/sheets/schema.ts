import { z } from 'zod';

/**
 * Structure d'une fiche technique.
 * Ce même schéma sert à la fois :
 *  - de format de sortie imposé à Claude (sorties structurées) ;
 *  - de validation avant chaque enregistrement en base.
 *
 * Chaque information porte sa source (document + page) et un indicateur
 * « needs_review ». Une fiche ne peut être publiée que si plus aucun champ
 * n'est à vérifier.
 */

export const sourceSchema = z
  .object({
    document: z.string().describe('Nom du document source'),
    page: z.number().int().nullable().describe('Numéro de page dans le document, si connu'),
  })
  .nullable();

const reviewFields = {
  source: sourceSchema.describe('Source exacte, ou null si l’information n’a pas été trouvée dans les documents'),
  needs_review: z
    .boolean()
    .describe('true si l’information est absente, ambiguë ou contradictoire entre sources'),
};

export const specItemSchema = z.object({
  label: z.string(),
  value: z.string().nullable().describe('Valeur avec unité, ou null si non trouvée'),
  ...reviewFields,
});

export const sheetContentSchema = z.object({
  summary: z.string().describe('Description courte et factuelle, 2 phrases maximum'),
  specs: z
    .array(z.object({ group: z.string(), items: z.array(specItemSchema) }))
    .describe('Caractéristiques regroupées (Moteur, Transmission, Hydraulique, Dimensions…)'),
  maintenance: z.array(
    z.object({
      operation: z.string(),
      interval_hours: z.number().nullable(),
      interval_months: z.number().nullable(),
      product: z.string().nullable(),
      capacity: z.string().nullable(),
      ...reviewFields,
    }),
  ),
  faults: z.array(
    z.object({
      symptom: z.string(),
      difficulty: z.enum(['facile', 'atelier']),
      causes: z.array(z.string()),
      checks: z.array(z.string()).describe('Vérifications dans l’ordre, de la plus simple à la plus complexe'),
      ...reviewFields,
    }),
  ),
  parts: z.array(
    z.object({
      name: z.string(),
      reference: z.string().nullable(),
      quantity: z.string().nullable(),
      ...reviewFields,
    }),
  ),
});

export type SheetContent = z.infer<typeof sheetContentSchema>;

export const emptySheetContent: SheetContent = {
  summary: '',
  specs: [],
  maintenance: [],
  faults: [],
  parts: [],
};

/** Nombre de champs encore à vérifier dans une fiche. */
export function countPendingReview(content: SheetContent): number {
  let n = 0;
  for (const g of content.specs) n += g.items.filter((i) => i.needs_review).length;
  n += content.maintenance.filter((m) => m.needs_review).length;
  n += content.faults.filter((f) => f.needs_review).length;
  n += content.parts.filter((p) => p.needs_review).length;
  return n;
}

/** Lecture tolérante du JSON stocké en base (ancien format, champ manquant…). */
export function parseSheetContent(raw: unknown): SheetContent {
  const parsed = sheetContentSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptySheetContent;
}
