import 'server-only';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { client, recordUsage } from '@/lib/ai';
import { runWithWebTools } from '@/lib/ai-web';
import { createServiceClient } from '@/lib/supabase/admin';
import { parisMonthStart } from '@/lib/diagnostic-quota';
import type { Machine } from '@/lib/types';

/**
 * Prix de revente estimé d'une machine :
 *  1. Claude cherche le prix catalogue neuf du modèle et des offres d'occasion
 *     comparables chez des concessionnaires (pas de plateformes d'annonces) ;
 *  2. la décote est calculée avec les courbes de valeur résiduelle de l'ASABE
 *     (norme américaine D497, référence du machinisme) selon l'âge et les heures ;
 *  3. les deux sont combinés, avec un petit bonus pour un entretien bien suivi.
 * C'est une estimation indicative, pas une cote officielle.
 */

/** Estimations par mois et par membre (recherche web : coût réel). */
export const VALUATIONS_MONTHLY = 10;
/** Une estimation reste affichée 30 jours. */
export const VALUATION_TTL_DAYS = 30;

export type ValuationRow = { id: string; machine_id: string; low_cents: number; mid_cents: number; high_cents: number; details: ValuationDetails; created_at: string };
export type ValuationDetails = {
  newPrice: number | null;
  asabe: number | null;
  comparablesMedian: number | null;
  comparables: { title: string; year: number | null; hours: number | null; price: number; url: string | null }[];
  maintenanceBonus: number;
  method: string;
  notes: string;
};

// Coefficients ASABE D497 (valeur restante = prix neuf × (C1 − C2·√âge − C3·√heures par an)²).
type Coefs = [number, number, number];
function coefficients(kind: Machine['kind'], powerHp: number | null): Coefs {
  switch (kind) {
    case 'tracteur':
      if (powerHp && powerHp < 80) return [0.981, 0.093, 0.0058];
      if (powerHp && powerHp > 150) return [0.976, 0.119, 0.0019];
      return [0.942, 0.1, 0.0008];
    case 'moissonneuse':
    case 'automoteur':
      return [1.132, 0.165, 0.0079];
    case 'telescopique':
      return [0.786, 0.063, 0.0033];
    case 'pulverisateur':
      return [0.886, 0.081, 0];
    default:
      return [0.943, 0.111, 0];
  }
}

export function asabeValue(newPrice: number, kind: Machine['kind'], powerHp: number | null, year: number | null, hours: number | null, now = new Date()) {
  if (!year) return null;
  const age = Math.max(0.5, now.getFullYear() + now.getMonth() / 12 - year);
  const perYear = hours && hours > 0 ? hours / age : 400;
  const [c1, c2, c3] = coefficients(kind, powerHp);
  const ratio = Math.max(0.08, c1 - c2 * Math.sqrt(age) - c3 * Math.sqrt(perYear));
  return newPrice * Math.min(1, ratio * ratio);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const round100 = (euros: number) => Math.round(euros / 100) * 100;

const researchSchema = z.object({
  new_price_eur: z.number().nullable().describe('Prix catalogue neuf HT en euros du modèle (version récente la plus proche), ou null si introuvable'),
  power_hp: z.number().nullable().describe('Puissance nominale en ch, si trouvée'),
  comparables: z
    .array(
      z.object({
        title: z.string(),
        year: z.number().nullable(),
        hours: z.number().nullable(),
        price_eur: z.number().describe('Prix demandé en euros'),
        url: z.string().nullable(),
      }),
    )
    .describe('Offres d’occasion du même modèle (ou du modèle équivalent de la même série) trouvées chez des concessionnaires ou dans la presse'),
  notes: z.string().describe('Une ou deux phrases utiles (série recherchée, rareté, version)'),
});

const SYSTEM = `Tu aides à estimer le prix de revente de matériel agricole d'occasion en France.
Cherche (4 recherches au plus) :
1. le prix catalogue neuf du modèle (tarif constructeur, presse spécialisée : Terre-net, Réussir Machinisme, Entraid, Matériel Agricole) ;
2. des offres d'occasion du même modèle, d'âge et d'heures proches, sur des sites de concessionnaires ou de négociants.
N'utilise pas de plateformes de petites annonces entre particuliers. Rédige un court dossier : prix neuf trouvé (avec la source), puis chaque offre comparable (titre, année, heures, prix, adresse). N'invente aucun chiffre.`;

export async function latestValuation(machineId: string): Promise<ValuationRow | null> {
  const since = new Date(Date.now() - VALUATION_TTL_DAYS * 86_400_000).toISOString();
  const { data } = await createServiceClient()
    .from('machine_valuations')
    .select('*')
    .eq('machine_id', machineId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ValuationRow | null) ?? null;
}

export async function valuationQuota(userId: string) {
  const { count } = await createServiceClient()
    .from('machine_valuations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', parisMonthStart().toISOString());
  const used = count ?? 0;
  return { used, limit: VALUATIONS_MONTHLY, remaining: Math.max(0, VALUATIONS_MONTHLY - used) };
}

export async function estimateMachine(params: {
  userId: string;
  machine: Pick<Machine, 'id' | 'kind' | 'brand' | 'model' | 'year' | 'hours'>;
  powerHp: number | null;
  logsLast2Years: number;
}): Promise<ValuationRow> {
  const m = params.machine;
  const label = [m.brand, m.model].filter(Boolean).join(' ');
  const research = await runWithWebTools({
    system: SYSTEM,
    prompt: `Machine : ${label}${m.year ? `, année ${m.year}` : ''}${m.hours ? `, ${Math.round(Number(m.hours))} heures` : ''}. Type : ${m.kind}.`,
    searches: 4,
    fetches: 2,
    pageTokens: 5000,
    maxTokens: 2500,
    deadlineMs: 70_000,
  });
  await recordUsage(params.userId, 'valuation', research.usage, research.model);

  const extract = await client().messages.parse({
    model: research.model,
    max_tokens: 1500,
    thinking: { type: 'disabled' },
    output_config: { format: zodOutputFormat(researchSchema) },
    messages: [{ role: 'user', content: `Extrais les informations de ce dossier sur le ${label}${m.year ? ` (${m.year})` : ''}. Ne garde que des chiffres présents dans le dossier.\n\n${research.text}` }],
  });
  await recordUsage(params.userId, 'valuation', extract.usage, research.model);
  const found = researchSchema.parse(extract.parsed_output ?? { new_price_eur: null, power_hp: null, comparables: [], notes: '' });

  const power = params.powerHp ?? found.power_hp;
  const asabe = found.new_price_eur && found.new_price_eur > 1000 ? asabeValue(found.new_price_eur, m.kind, power, m.year, m.hours ? Number(m.hours) : null) : null;
  const comps = found.comparables.filter((c) => c.price_eur > 500 && c.price_eur < 2_000_000);
  const compMedian = comps.length >= 2 ? median(comps.map((c) => c.price_eur)) : null;
  let mid = asabe && compMedian ? asabe * 0.5 + compMedian * 0.5 : asabe ?? compMedian ?? (comps.length === 1 ? comps[0].price_eur : null);
  if (!mid) throw new Error('Pas assez d’informations publiques sur ce modèle pour l’estimer.');
  // Carnet bien tenu : un acheteur paie plus volontiers une machine dont on connaît l'historique.
  const bonus = params.logsLast2Years >= 3 ? 0.03 : params.logsLast2Years === 0 ? -0.03 : 0;
  mid *= 1 + bonus;
  const spread = asabe && compMedian ? 0.1 : 0.16;
  const details: ValuationDetails = {
    newPrice: found.new_price_eur,
    asabe: asabe ? round100(asabe) : null,
    comparablesMedian: compMedian ? round100(compMedian) : null,
    comparables: comps.slice(0, 6).map((c) => ({ title: c.title, year: c.year, hours: c.hours, price: c.price_eur, url: c.url })),
    maintenanceBonus: bonus,
    method: asabe && compMedian ? 'décote ASABE et offres comparables' : asabe ? 'décote ASABE depuis le prix neuf' : 'offres comparables',
    notes: found.notes,
  };
  const { data, error } = await createServiceClient()
    .from('machine_valuations')
    .insert({
      machine_id: m.id,
      user_id: params.userId,
      low_cents: round100(mid * (1 - spread)) * 100,
      mid_cents: round100(mid) * 100,
      high_cents: round100(mid * (1 + spread)) * 100,
      details,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`Estimation non enregistrée : ${error?.message}`);
  return data as ValuationRow;
}
