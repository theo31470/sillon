import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { client, recordUsage } from '@/lib/ai';
import { env } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/admin';
import type { PhotoCredit } from '@/lib/types';

/**
 * Photos réelles des tracteurs, uniquement sous licence libre.
 *
 * Source : Wikimedia Commons (photos publiées par leurs auteurs sous licence
 * Creative Commons ou dans le domaine public). Ces licences autorisent la
 * réutilisation, à condition de citer l'auteur, la licence et la source :
 * c'est ce que fait la fiche. Les photos des constructeurs, des annonces ou de
 * la presse sont protégées par le droit d'auteur : citer la source ne suffit pas,
 * il faut une autorisation (dépôt manuel avec crédit dans l'admin).
 */

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
// Wikimedia demande un User-Agent qui identifie l'application.
const UA = `TracteursEtCoBot/1.0 (${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tracteursandco.fr'}; fiches techniques agricoles)`;

/** Licences acceptées (Commons n'héberge pas de licences « NC » ou « ND », on vérifie quand même). */
function acceptableLicense(name: string) {
  if (/\b(NC|ND)\b/i.test(name)) return false;
  return /^(CC BY(-SA)? \d(\.\d)?|CC0|Public domain|PD\b|Domaine public)/i.test(name.trim());
}

function stripHtml(html: string) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type Candidate = {
  title: string;
  description: string;
  author: string;
  license: string;
  licenseUrl: string | null;
  pageUrl: string;
  thumbUrl: string;
  smallUrl: string;
};

type CommonsPage = {
  title: string;
  imageinfo?: {
    thumburl?: string;
    url: string;
    descriptionurl: string;
    mime: string;
    extmetadata?: Record<string, { value?: string } | undefined>;
  }[];
};

async function searchCommons(query: string): Promise<Candidate[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '12',
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '1600',
    iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ImageDescription|Restrictions',
    origin: '*',
  });
  const res = await fetch(`${COMMONS_API}?${params}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return [];
  const json = (await res.json()) as { query?: { pages?: CommonsPage[] } };
  const out: Candidate[] = [];
  for (const page of json.query?.pages ?? []) {
    const info = page.imageinfo?.[0];
    const meta = info?.extmetadata ?? {};
    if (!info || !['image/jpeg', 'image/png', 'image/webp'].includes(info.mime)) continue;
    const license = stripHtml(meta.LicenseShortName?.value ?? '');
    if (!acceptableLicense(license)) continue;
    if (/personality/i.test(meta.Restrictions?.value ?? '')) continue;
    const thumbUrl = info.thumburl ?? info.url;
    out.push({
      title: page.title.replace(/^File:/, ''),
      description: stripHtml(meta.ImageDescription?.value ?? '').slice(0, 300),
      author: stripHtml(meta.Artist?.value ?? '').slice(0, 120) || 'Auteur inconnu',
      license,
      licenseUrl: meta.LicenseUrl?.value ?? null,
      pageUrl: info.descriptionurl,
      thumbUrl,
      smallUrl: thumbUrl.includes('/thumb/') ? thumbUrl.replace(/\/\d+px-/, '/480px-') : thumbUrl,
    });
  }
  return out;
}

async function download(url: string, maxBytes: number) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const type = (res.headers.get('content-type') ?? '').split(';')[0];
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > maxBytes) return null;
  return { buffer, type: type as 'image/jpeg' | 'image/png' | 'image/webp' };
}

const choiceSchema = z.object({
  index: z.number().int().nullable().describe('Numéro de la photo retenue (à partir de 1), ou null si aucune ne convient'),
  match: z.enum(['modele', 'serie']).describe('« modele » si la photo montre exactement ce modèle, « serie » si c’est un autre modèle de la même série et de la même génération (même carrosserie)'),
  shown_model: z.string().describe('Modèle visible sur la photo, tel qu’indiqué par le nom du fichier ou la description (ex. « Fendt 314 Vario »)'),
  confidence: z.enum(['haute', 'moyenne', 'faible']),
  reason: z.string().describe('Une phrase'),
});

/** Claude regarde les photos candidates et retient celle qui montre bien ce modèle. */
async function pickPhoto(params: { userId: string; label: string; series: string; candidates: Candidate[] }) {
  const images = (await Promise.all(params.candidates.map((c) => download(c.smallUrl, 1_500_000)))).map((img, i) => ({ img, c: params.candidates[i] }));
  const usable = images.filter((x) => x.img);
  if (!usable.length) return null;

  const content: Anthropic.ContentBlockParam[] = [];
  usable.forEach(({ img, c }, i) => {
    content.push({ type: 'text', text: `Photo ${i + 1} — fichier « ${c.title} »${c.description ? ` — description : ${c.description}` : ''}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: img!.type, data: img!.buffer.toString('base64') } });
  });
  content.push({
    type: 'text',
    text: `Choisis la photo qui illustrera la fiche du tracteur « ${params.label} »${params.series ? ` (série ${params.series})` : ''}.
Ordre de préférence :
1. une photo de CE modèle exactement (match = "modele") ;
2. à défaut, une photo d'un autre modèle de la MÊME série et de la même génération, qui a la même carrosserie (match = "serie") : par exemple un 314 Vario pour illustrer un 312 Vario de la même génération. Une autre série, une génération plus ancienne ou plus récente (design différent) ne convient pas.
Vérifie avec le nom du fichier, la description et l'aspect. Le tracteur entier doit être visible et net, de préférence de trois-quarts ou de profil, en situation réelle. Refuse les jouets, miniatures, maquettes, détails, intérieurs de cabine, et les photos où une personne est reconnaissable au premier plan.
Si aucune ne convient, réponds index = null.`,
  });

  const response = await client().messages.parse({
    model: env.anthropicImportModel(),
    max_tokens: 400,
    // Pas de réflexion : elle consommait le budget de sortie et coupait le JSON.
    thinking: { type: 'disabled' },
    output_config: { format: zodOutputFormat(choiceSchema) },
    messages: [{ role: 'user', content }],
  });
  await recordUsage(params.userId, 'photo_selection', response.usage, env.anthropicImportModel());
  const choice = response.parsed_output;
  if (!choice || choice.index === null || choice.confidence === 'faible') return null;
  const c = usable[choice.index - 1]?.c;
  return c ? { candidate: c, sameModel: choice.match === 'modele', shownModel: choice.shown_model.trim().slice(0, 80) } : null;
}

/**
 * Cherche une photo libre du modèle et l'attache à la fiche (copie dans notre
 * stockage, crédit complet). Renvoie le crédit, ou null si rien de convenable.
 */
export async function attachCommonsPhoto(params: { userId: string; sheetId: string; brand: string; model: string; series?: string | null }): Promise<PhotoCredit | null> {
  const label = `${params.brand} ${params.model}`.trim();
  // Série sans la génération (« 300 Vario Gen5 » → « 300 Vario ») : c'est ainsi que les photos sont nommées.
  const series = (params.series ?? '').trim();
  const seriesBase = series.replace(/\s*(gen|génération)\s*\d+(\.\d+)?\b/i, '').trim();
  const queries = [`"${label}"`, label, `${label} tractor`];
  if (series) queries.push(`${params.brand} ${series}`, `${params.brand} ${seriesBase}`);
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const q of [...new Set(queries)]) {
    for (const c of await searchCommons(q)) {
      if (seen.has(c.pageUrl)) continue;
      seen.add(c.pageUrl);
      candidates.push(c);
    }
    // Assez de candidates pour le modèle exact : inutile d'élargir à la série.
    if (candidates.length >= 8) break;
  }
  if (!candidates.length) return null;

  const picked = await pickPhoto({ userId: params.userId, label, series, candidates: candidates.slice(0, 10) });
  if (!picked) return null;
  const chosen = picked.candidate;

  const image = await download(chosen.thumbUrl, 5 * 1024 * 1024);
  if (!image) return null;
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[image.type];
  const path = `fiches/${params.sheetId}/${Date.now()}.${ext}`;
  const db = createServiceClient();
  const { error } = await db.storage.from('media').upload(path, image.buffer, { contentType: image.type, upsert: false });
  if (error) throw new Error('Enregistrement de la photo impossible');
  const credit: PhotoCredit = {
    source: 'commons',
    author: chosen.author,
    license: chosen.license,
    license_url: chosen.licenseUrl,
    source_url: chosen.pageUrl,
    title: chosen.title,
    // Photo d'un autre modèle de la même série : on le dit clairement sous la photo.
    note: picked.sameModel ? null : `Photo d’un ${picked.shownModel || 'modèle de la même série'}, même série`,
  };
  const cover_url = db.storage.from('media').getPublicUrl(path).data.publicUrl;
  await db.from('tech_sheets').update({ cover_url, cover_credit: credit }).eq('id', params.sheetId);
  return credit;
}

/**
 * Reprend la photo d'un autre modèle de la même série déjà illustré (aucun coût) :
 * le fichier est copié pour que chaque fiche garde sa propre photo.
 */
export async function reuseSeriesPhoto(params: { sheetId: string; brand: string; series: string; model: string }): Promise<PhotoCredit | null> {
  if (!params.series) return null;
  const db = createServiceClient();
  const { data: siblings } = await db
    .from('catalog_models')
    .select('model, sheet_id')
    .ilike('brand', params.brand)
    .eq('series', params.series)
    .eq('photo_status', 'found')
    .neq('model', params.model)
    .not('sheet_id', 'is', null)
    .limit(10);
  for (const sib of siblings ?? []) {
    const { data: sheet } = await db.from('tech_sheets').select('cover_url, cover_credit').eq('id', sib.sheet_id!).maybeSingle();
    const credit = sheet?.cover_credit as PhotoCredit | null;
    if (!sheet?.cover_url || !credit || credit.source !== 'commons') continue;
    const from = decodeURIComponent(sheet.cover_url.split('/object/public/media/')[1] ?? '');
    if (!/^fiches\/[0-9a-f-]{36}\/[\w.-]+$/.test(from)) continue;
    const to = `fiches/${params.sheetId}/${Date.now()}.${from.split('.').pop()}`;
    const { error } = await db.storage.from('media').copy(from, to);
    if (error) continue;
    const reused: PhotoCredit = { ...credit, note: credit.note ?? `Photo d’un ${params.brand} ${sib.model}, même série` };
    const cover_url = db.storage.from('media').getPublicUrl(to).data.publicUrl;
    await db.from('tech_sheets').update({ cover_url, cover_credit: reused }).eq('id', params.sheetId);
    return reused;
  }
  return null;
}
