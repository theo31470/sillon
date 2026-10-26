import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { env } from '@/lib/env';
import { client, recordUsage } from '@/lib/ai';
import { sheetContentSchema, type SheetContent } from '@/lib/sheets/schema';

/**
 * Recherche web par Claude pour l'import des tracteurs par marque.
 *
 * Deux temps, pour rester dans la durée maximale d'une fonction serveur :
 *  1. researchModel : Claude cherche et lit les pages (site du constructeur
 *     d'abord, brochures PDF, presse spécialisée) et rédige un dossier où
 *     chaque valeur est suivie de son adresse source ;
 *  2. sheetFromResearch : à partir de ce seul dossier, Claude remplit la fiche
 *     au format imposé (sortie structurée), chaque valeur avec sa source.
 */

/**
 * Bases de données de caractéristiques d'autres éditeurs, petites annonces :
 * on ne s'en sert pas. Reprendre systématiquement le contenu d'une base de
 * données tierce est interdit en droit européen (droit sui generis des bases
 * de données), même valeur par valeur. Liste à compléter si besoin.
 */
export const BLOCKED_DOMAINS = [
  'tractordata.com',
  'lectura-specs.com',
  'lectura-specs.fr',
  'lectura-specs.de',
  'tracteurdata.com',
  'tractorspecs.net',
  'agridonnees.fr',
  'tractorbook.de',
  'traktorbook.com',
  'agriaffaires.com',
  'leboncoin.fr',
  'ebay.fr',
  'motocult.fr',
];

/** Autres domaines officiels d'un constructeur (brochures, documentation). */
const EXTRA_BRAND_DOMAINS: Record<string, string[]> = {
  'John Deere': ['deere.com', 'johndeere.fr'],
  Fendt: ['fendt.fr', 'agcocorp.com'],
  'Massey Ferguson': ['masseyferguson.fr', 'agcocorp.com'],
  Valtra: ['valtra.com', 'agcocorp.com'],
  Claas: ['claas.fr'],
  'New Holland': ['newholland.fr', 'cnh.com'],
  'Case IH': ['caseih.fr', 'cnh.com'],
  Kubota: ['kubota.fr', 'kubota.com'],
};

/** Domaines officiels d'une marque (site principal + domaines secondaires connus). */
export function brandDomains(brand: string) {
  const main = BRAND_SITES[brand];
  return main ? [main, ...(EXTRA_BRAND_DOMAINS[brand] ?? [])] : [];
}

/** Sites des constructeurs, à consulter en priorité. */
export const BRAND_SITES: Record<string, string> = {
  'John Deere': 'deere.fr',
  Fendt: 'fendt.com',
  'Massey Ferguson': 'masseyferguson.com',
  Valtra: 'valtra.fr',
  Claas: 'claas.com',
  'New Holland': 'newholland.com',
  'Case IH': 'caseih.com',
  Steyr: 'steyr-traktoren.com',
  'Deutz-Fahr': 'deutz-fahr.com',
  Same: 'same-tractors.com',
  Lamborghini: 'lamborghini-tractors.com',
  Kubota: 'kubota-eu.com',
  McCormick: 'mccormick.it',
  Landini: 'landini.it',
  Zetor: 'zetor.com',
  JCB: 'jcb.com',
  'Antonio Carraro': 'antoniocarraro.it',
  Lindner: 'lindner-traktoren.at',
  Kioti: 'kioti.com',
};

const USER_LOCATION = { type: 'approximate' as const, country: 'FR', timezone: 'Europe/Paris' };

/**
 * Coûts : chaque recherche ajoute des pages entières au contexte, et Claude relit
 * tout le contexte à chaque nouvelle recherche. On limite donc fortement le nombre
 * de recherches et la taille des pages lues, et on utilise Haiku (20 fois moins
 * cher que Sonnet tant que chaque requête reste sous 100 000 tokens).
 */
type WebToolsOptions = { searches: number; fetches: number; pageTokens?: number; allowedDomains?: string[] };

function webTools({ searches, fetches, pageTokens = 6000, allowedDomains }: WebToolsOptions): Anthropic.ToolUnion[] {
  // allowed_domains et blocked_domains ne peuvent pas être combinés.
  const domains = allowedDomains?.length ? { allowed_domains: allowedDomains } : { blocked_domains: BLOCKED_DOMAINS };
  const tools: Anthropic.ToolUnion[] = [{ type: 'web_search_20250305', name: 'web_search', max_uses: searches, ...domains, user_location: USER_LOCATION }];
  if (fetches > 0) {
    // La lecture ne peut ouvrir que des adresses déjà apparues dans les résultats de recherche
    // (donc officielles quand la recherche est limitée) : pas de liste blanche ici, qui
    // bloquait les sous-domaines (ex. api.fendt.com, où Fendt publie ses fiches techniques).
    tools.push({ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: fetches, blocked_domains: BLOCKED_DOMAINS, max_content_tokens: pageTokens });
  }
  return tools;
}

export type WebSource = { name: string; url: string };

/** Fait tourner un échange avec outils web jusqu'au bout (reprend les pauses). */
async function runWithWebTools(params: {
  system: string;
  prompt: string;
  searches: number;
  fetches: number;
  /** Taille maximale d'une page lue en entier (tokens). */
  pageTokens?: number;
  /** Limite la recherche et la lecture à ces domaines (sites officiels). */
  allowedDomains?: string[];
  maxTokens: number;
  deadlineMs: number;
}) {
  const tools = webTools(params);
  const model = env.anthropicImportModel();
  const started = Date.now();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: params.prompt }];
  const usage = {
    input_tokens: 0,
    output_tokens: 0,
    max_prompt_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 } as Anthropic.ServerToolUsage,
  };
  const blocks: Anthropic.ContentBlock[] = [];
  const add = (response: Anthropic.Message) => {
    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;
    usage.cache_read_input_tokens += response.usage.cache_read_input_tokens ?? 0;
    usage.cache_creation_input_tokens += response.usage.cache_creation_input_tokens ?? 0;
    usage.max_prompt_tokens = Math.max(
      usage.max_prompt_tokens,
      response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
    );
    usage.server_tool_use.web_search_requests += response.usage.server_tool_use?.web_search_requests ?? 0;
    usage.server_tool_use.web_fetch_requests += response.usage.server_tool_use?.web_fetch_requests ?? 0;
    blocks.push(...response.content);
  };
  // Réflexion désactivée : sans cela, le modèle peut dépenser tout son budget de sortie
  // à réfléchir entre deux recherches et ne rien écrire (dossier vide, « max_tokens »).
  const remaining = () => Math.max(30_000, params.deadlineMs - (Date.now() - started));

  let stop: Anthropic.Message['stop_reason'] = null;
  for (let turn = 0; turn < 6; turn++) {
    const response = await client().messages.create(
      { model, max_tokens: params.maxTokens, system: params.system, tools, thinking: { type: 'disabled' }, messages },
      { timeout: remaining() },
    );
    add(response);
    stop = response.stop_reason;
    // Pause d'un long tour de recherche : on renvoie la réponse telle quelle pour continuer.
    messages.push({ role: 'assistant', content: response.content as Anthropic.ContentBlockParam[] });
    if (stop !== 'pause_turn' || Date.now() - started > params.deadlineMs * 0.6) break;
  }

  const textOf = (bs: Anthropic.ContentBlock[]) =>
    bs
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
  let text = textOf(blocks);

  // Recherche interrompue (pause non reprise, réponse coupée) ou dossier vide : on demande
  // la rédaction du dossier complet à partir de ce qui a déjà été lu, sans nouvelle recherche.
  if (stop !== 'end_turn' || text.length < 400) {
    console.warn('[recherche web] rédaction finale forcée', { stop, longueur: text.length });
    messages.push({
      role: 'user',
      content: 'Rédige maintenant le dossier COMPLET, dans le format demandé, uniquement avec les informations déjà trouvées dans les pages consultées. Aucune nouvelle recherche.',
    });
    const final = await client().messages.create(
      { model, max_tokens: params.maxTokens, system: params.system, tools, thinking: { type: 'disabled' }, tool_choice: { type: 'none' }, messages },
      { timeout: remaining() },
    );
    add(final);
    const finalText = textOf(final.content);
    if (finalText.length > 200) text = finalText;
  }

  for (const b of blocks) {
    if (b.type === 'web_fetch_tool_result' && b.content.type !== 'web_fetch_result') console.warn('[recherche web] lecture impossible', JSON.stringify(b.content).slice(0, 300));
  }
  // Pages réellement citées ou lues.
  const sources = new Map<string, string>();
  for (const b of blocks) {
    if (b.type === 'text') {
      for (const c of b.citations ?? []) if (c.type === 'web_search_result_location') sources.set(c.url, c.title ?? c.url);
    }
    if (b.type === 'web_fetch_tool_result' && b.content.type === 'web_fetch_result') {
      sources.set(b.content.url, b.content.content.title ?? b.content.url);
    }
  }
  return { text, usage, model, sources: [...sources].map(([url, name]) => ({ url, name })) as WebSource[] };
}

// ---------------------------------------------------------------------
// 1. Lister les modèles d'une marque
// ---------------------------------------------------------------------

export const catalogListSchema = z.object({
  models: z.array(
    z.object({
      series: z.string().describe('Série ou gamme, ex. « 700 Vario », « Axion 800 » ; chaîne vide si aucune'),
      model: z.string().describe('Désignation commerciale exacte du modèle, sans la marque'),
      years: z.string().describe('Années de production, ex. « 2014-2021 » ou « depuis 2022 » ; vide si inconnu'),
      power_hp: z.number().int().nullable().describe('Puissance nominale en ch, ou null si inconnue'),
      source_url: z.string().nullable().describe('Page où le modèle est mentionné'),
    }),
  ),
  note: z.string().describe('Remarque utile pour l’administrateur (gamme incomplète, rachat de marque…), ou chaîne vide'),
});
export type CatalogList = z.infer<typeof catalogListSchema>;

const LIST_SYSTEM = `Tu es documentaliste pour Tracteurs & Co, un site technique destiné aux agriculteurs français.
On te demande la liste des modèles de tracteurs d'une marque, pour préparer des fiches techniques.
- Cherche d'abord sur le site officiel du constructeur (gamme actuelle) ; pour les modèles anciens, sur des sources sérieuses (constructeur, presse agricole, clubs de marque). Fais peu de recherches, bien ciblées.
- Ne liste que des tracteurs agricoles (pas de moissonneuses, chargeurs, engins de chantier), et seulement des modèles dont tu as trouvé une trace dans les pages consultées. N'invente aucun modèle.
- Ne liste pas séparément les simples variantes de carrosserie ou de finition d'un même modèle (V/F/P, Power/Profi…) : un modèle par puissance.
- Un modèle par ligne, avec sa série, ses années de production si trouvées, sa puissance nominale en ch si trouvée, et l'adresse de la page.
- Signale les rachats et changements de nom (par exemple Renault Agriculture repris par Claas, Fiat devenu New Holland).
- Réponds en français.`;

export async function listBrandModels(params: { userId: string; brand: string; scope: string }) {
  const site = BRAND_SITES[params.brand];
  const research = await runWithWebTools({
    system: LIST_SYSTEM,
    prompt: `Marque : ${params.brand}${site ? ` (site officiel : ${site})` : ''}
Périmètre demandé : ${params.scope || 'gamme actuelle de tracteurs'}
Dresse la liste des modèles (60 au maximum), regroupés par série.`,
    searches: 4,
    fetches: 1,
    maxTokens: 6000,
    deadlineMs: 200_000,
  });
  await recordUsage(params.userId, 'catalog_listing', research.usage, research.model);
  if (!research.text) throw new Error('Claude n’a rien trouvé pour cette marque.');

  const model = env.anthropicImportModel();
  const response = await client().messages.parse({
    model,
    max_tokens: 8000,
    // Pas de réflexion : elle consommait le budget de sortie et coupait le JSON.
    thinking: { type: 'disabled' },
    system: 'Tu convertis une liste de modèles de tracteurs en données structurées, sans rien ajouter ni deviner.',
    output_config: { format: zodOutputFormat(catalogListSchema) },
    messages: [{ role: 'user', content: `Marque : ${params.brand}\n\n<liste>\n${research.text}\n</liste>` }],
  });
  await recordUsage(params.userId, 'catalog_listing', response.usage, model);
  if (!response.parsed_output) throw new Error('Réponse de Claude inexploitable');
  return catalogListSchema.parse(response.parsed_output);
}

// ---------------------------------------------------------------------
// 2. Dossier de recherche : une fois par SÉRIE (réutilisé pour chaque modèle)
// ---------------------------------------------------------------------

const RESEARCH_SYSTEM = `Tu es documentaliste technique pour Tracteurs & Co, un site destiné aux agriculteurs français.
Tu prépares le dossier technique d'une série de tracteurs (ou d'un modèle), qui servira ensuite à rédiger une fiche par modèle.

Méthode (3 recherches au maximum, 1 seule page lue en entier : choisis bien tes requêtes) :
1. Cherche d'abord sur le site officiel du constructeur : page de la série, tableau des caractéristiques, brochure.
2. Complète si besoin avec la presse agricole spécialisée. Forums et petites annonces : jamais seuls.

Règles impératives :
- N'écris QUE des informations lues dans les pages consultées. Jamais de valeur de mémoire.
- Une information par ligne : « Libellé : valeur — source : URL ».
- Valeurs communes à toute la série d'abord, puis un tableau des valeurs propres à chaque modèle (puissance, couple, cylindrée, poids, réservoir, pneus…).
- Précise la version concernée quand elle varie (finition, option, années). Signale les contradictions (« CONTRADICTION : … »).
- Si la série ou le modèle est introuvable, dis-le dès la première ligne.
- Réponds en français, unités métriques. Sois concis : pas de phrases, des lignes de données.

Rubriques : Identification (années, usine) ; Moteur ; Transmission ; Prise de force ; Hydraulique et relevage ; Pneumatiques ; Dimensions et masses ; Capacités (carburant, AdBlue, huiles) ; Entretien (intervalles) ; Pièces d'entretien (références d'origine si publiées).`;

/**
 * Lecture de la documentation OFFICIELLE : la meilleure source (valeurs exactes, modèle
 * par modèle) et la moins chère (une recherche, une ou deux pages lues en entier).
 */
const OFFICIAL_SYSTEM = `Tu es documentaliste technique pour Tracteurs & Co, un site destiné aux agriculteurs français.
Tu recopies les caractéristiques techniques OFFICIELLES d'une série de tracteurs, publiées par le constructeur.

Méthode :
1. Une recherche (deux au plus) sur le site du constructeur pour trouver la page « caractéristiques techniques / données techniques » de la série, ou sa brochure PDF (en français de préférence, sinon en anglais ou en allemand).
2. Lis en entier la page ou la brochure qui contient le TABLEAU COMPLET des données techniques. Si elle est incomplète, lis-en une deuxième.
3. Recopie fidèlement ce tableau.

Règles impératives :
- Uniquement ce qui est écrit dans les pages lues. Jamais de valeur de mémoire, jamais d'estimation.
- Format : tableaux markdown, une colonne par modèle, une ligne par caractéristique, unités d'origine converties en métrique. Sous chaque tableau : « Source : URL exacte de la page lue ».
- Rubriques, dans cet ordre, avec tout ce que le document donne : Moteur (marque, cylindres, cylindrée, puissance nominale et maximale en ch et kW avec la norme, couple maxi, régime) ; Transmission (type, vitesses, vitesse maxi) ; Prise de force (régimes, avant/arrière) ; Hydraulique (débit, pression, distributeurs, relevage arrière et avant) ; Pneumatiques ; Dimensions et masses (empattement, longueur, largeur, hauteur, garde au sol, poids à vide, PTAC) ; Capacités (carburant, AdBlue, huile moteur, transmission, hydraulique, refroidissement) ; Entretien (intervalles de vidange et de filtres s'ils sont indiqués).
- Indique la version ou la génération exacte décrite par le document (et son année). Si le document couvre plusieurs générations, sépare-les.
- Si tu ne trouves aucune donnée officielle, écris seulement « INTROUVABLE » suivi des adresses consultées.`;

export async function researchSeries(params: { userId: string; brand: string; series: string; models: string[]; years: string }) {
  const domains = brandDomains(params.brand);
  const target = params.series
    ? `Série : ${params.brand} ${params.series}. Modèles à couvrir : ${params.models.join(', ')}.`
    : `Tracteur : ${params.brand} ${params.models[0]}.`;
  const years = params.years ? ` Années : ${params.years}.` : '';

  // 1. Documentation officielle du constructeur.
  let official: Awaited<ReturnType<typeof runWithWebTools>> | null = null;
  if (domains.length) {
    official = await runWithWebTools({
      system: OFFICIAL_SYSTEM,
      prompt: `${target}${years}\nSites officiels : ${domains.join(', ')}.\nRecopie les caractéristiques techniques officielles.`,
      searches: 2,
      fetches: 2,
      pageTokens: 20_000,
      allowedDomains: domains,
      maxTokens: 8000,
      deadlineMs: 120_000,
    });
    await recordUsage(params.userId, 'sheet_research', official.usage, official.model);
  }
  const officialOk = Boolean(official && official.text.length > 1200 && !/^\s*INTROUVABLE/i.test(official.text));
  if (official && officialOk) return { notes: official.text, sources: official.sources };

  // 2. Rien d'exploitable chez le constructeur : recherche élargie (presse spécialisée).
  const result = await runWithWebTools({
    system: RESEARCH_SYSTEM,
    prompt: `${target}${years}
${domains.length ? `Site officiel du constructeur : ${domains[0]} (déjà consulté sans succès : privilégie la presse agricole et les essais).` : ''}
Prépare le dossier.`,
    searches: 3,
    fetches: 1,
    maxTokens: 8000,
    deadlineMs: 150_000,
  });
  await recordUsage(params.userId, 'sheet_research', result.usage, result.model);
  if (result.text.length < 200) throw new Error('Dossier de recherche trop maigre : modèle introuvable ?');
  return { notes: result.text, sources: [...(official?.sources ?? []), ...result.sources] };
}

// ---------------------------------------------------------------------
// 2 bis. Dossier ENTRETIEN et PANNES (en parallèle du dossier technique)
// ---------------------------------------------------------------------

export const UPKEEP_MARKER = '=== ENTRETIEN ET PANNES ===';

const UPKEEP_SYSTEM = `Tu es documentaliste technique pour Tracteurs & Co, un site destiné aux agriculteurs français.
Tu prépares la partie ENTRETIEN et PANNES du dossier d'une série de tracteurs (ou d'un modèle).

À chercher (3 recherches au maximum, 1 seule page lue en entier : choisis bien tes requêtes) :
1. Plan d'entretien : manuel d'utilisation ou carnet d'entretien officiel (sites de documentation des constructeurs), intervalles en heures, normes et types d'huile, capacités.
2. Pannes connues sur cette série : rappels du constructeur, essais longue durée et retours d'expérience de la presse agricole, problèmes rapportés par PLUSIEURS propriétaires sur des forums agricoles (un témoignage isolé ne suffit pas).
3. Pour chaque panne : symptômes, causes, et tests à faire dans l'ordre (contrôles visuels, niveaux, codes défaut affichés, filtres, mesures de pression ou de tension avec leurs valeurs si elles sont publiées).

Règles impératives :
- N'écris QUE ce que tu as lu dans les pages consultées. Jamais de mémoire.
- Une information par ligne : « [constructeur|presse|utilisateurs] Libellé : contenu — source : URL ».
- Indique le nombre de témoignages concordants pour les pannes rapportées par des utilisateurs.
- Si tu ne trouves rien sur un point, écris-le simplement.
- Français, concis : des lignes de données, pas de phrases d'introduction.`;

export async function researchUpkeep(params: { userId: string; brand: string; series: string; models: string[]; years: string }) {
  const target = params.series
    ? `Série : ${params.brand} ${params.series} (modèles : ${params.models.join(', ')}).`
    : `Tracteur : ${params.brand} ${params.models[0]}.`;
  const result = await runWithWebTools({
    system: UPKEEP_SYSTEM,
    prompt: `${target}${params.years ? ` Années : ${params.years}.` : ''}\nPrépare la partie entretien et pannes du dossier.`,
    searches: 3,
    fetches: 1,
    maxTokens: 6000,
    deadlineMs: 230_000,
  });
  await recordUsage(params.userId, 'sheet_research', result.usage, result.model);
  return { notes: result.text, sources: result.sources };
}

// ---------------------------------------------------------------------
// 3. Fiche structurée à partir du dossier
// ---------------------------------------------------------------------

const WRITE_SYSTEM = `Tu es rédacteur technique pour Tracteurs & Co. Tu remplis la fiche technique d'UN tracteur en français, uniquement à partir du dossier de recherche fourni.

Règles impératives :
- Caractéristiques et pièces : n'utilise QUE le dossier, rien de tes connaissances générales. Seule exception : les repères d'entretien et de pannes d'origine "general" décrits plus bas, toujours à faire vérifier.
- Le dossier peut couvrir toute une série : garde les valeurs communes à la série et les valeurs propres à CE modèle ; jamais celles d'un autre modèle.
- Chaque valeur porte sa source : document = titre de la page ou nom du site, url = adresse exacte indiquée dans le dossier pour cette valeur, page = null (ou le numéro de page s'il s'agit d'une brochure PDF et qu'il est indiqué).
- needs_review = false seulement si la valeur vient du site ou d'une brochure du constructeur, ou de deux sources concordantes. Sinon (source unique non officielle, contradiction, version incertaine) : needs_review = true.
- Valeur absente : ne crée pas la ligne, sauf si elle est indispensable (puissance, poids) : alors value = null, source = null, needs_review = true.
- Groupes de caractéristiques dans cet ordre quand ils existent : Moteur, Transmission et prise de force, Hydraulique et relevage, Pneus, Dimensions, Masses, Capacités.
- Chaque opération d'entretien et chaque panne porte son origine : "constructeur", "presse" ou "utilisateurs" selon la source du dossier (marquée entre crochets), ou "general" (voir plus bas).
- Une panne d'origine "utilisateurs" a toujours needs_review = true.

Entretien :
- Reprends les opérations et intervalles du dossier.
- N'ajoute JAMAIS un repère "general" pour une opération déjà présente dans le dossier (même sous un autre nom : vidange moteur, filtre à huile…). Si deux sources donnent des intervalles différents pour la même opération, garde une seule ligne avec l'intervalle du constructeur (sinon celui de la presse) et needs_review = true.
- Si le dossier ne couvre pas les opérations courantes, complète avec les repères habituels pour ce type de tracteur (vidange moteur et filtre, filtres à carburant, filtre à air, huile de transmission et d'hydraulique, ponts, liquide de refroidissement, graissage), avec origin = "general", source = null, needs_review = true. Reste prudent (intervalles usuels du marché) et n'invente JAMAIS une capacité, une référence ou une norme d'huile précise : product = null, capacity = null pour ces repères.

Pannes et tests :
- Reprends toutes les pannes du dossier, avec leur origine.
- S'il y en a moins de 4, complète avec 2 ou 3 pannes courantes pour ce type de tracteur (selon sa transmission, son hydraulique, son électronique et son post-traitement moteur), avec origin = "general", source = null, needs_review = true.
- checks = tests concrets dans l'ordre, du plus simple au plus poussé : mise en sécurité si nécessaire, niveaux, fusibles, codes défaut affichés sur le terminal, filtres, puis mesures (pression, tension) en donnant les valeurs de contrôle seulement si elles figurent dans le dossier.
- difficulty = "atelier" dès qu'il faut démonter un organe interne ou intervenir sur l'hydraulique haute pression, l'injection ou l'électronique.

Pièces : références d'origine seulement si elles figurent dans le dossier.
- Résumé : 2 phrases factuelles (type de tracteur, puissance, transmission, usage).
- Format français : virgule décimale, espace pour les milliers, unités métriques.`;

export async function sheetFromResearch(params: { userId: string; brand: string; model: string; notes: string }): Promise<{ content: SheetContent; model: string }> {
  const model = env.anthropicImportModel();
  const response = await client().messages.parse({
    model,
    max_tokens: 16000,
    // Pas de réflexion : elle consommait le budget de sortie et coupait le JSON.
    thinking: { type: 'disabled' },
    system: WRITE_SYSTEM,
    output_config: { format: zodOutputFormat(sheetContentSchema) },
    messages: [
      {
        role: 'user',
        content: `Tracteur : ${params.brand} ${params.model}\n\n<dossier>\n${params.notes}\n</dossier>\n\nRemplis la fiche de ce modèle (caractéristiques, entretien, pannes, pièces).`,
      },
    ],
  });
  await recordUsage(params.userId, 'sheet_generation', response.usage, model);
  if (!response.parsed_output) throw new Error('Réponse de Claude inexploitable');
  return { content: sheetContentSchema.parse(response.parsed_output), model };
}
