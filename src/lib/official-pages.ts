import 'server-only';


/**
 * Téléchargement direct d'une page officielle de caractéristiques techniques
 * (ex. api.fendt.com/techdata/…) : le tableau complet, sans passer par les
 * extraits de la recherche web. Beaucoup moins cher (une page de quelques
 * milliers de caractères) et plus fiable (toutes les lignes, tous les modèles).
 *
 * Sécurité : seules des adresses https des domaines officiels de la marque sont
 * ouvertes (pas d'adresse IP, pas d'autre site), y compris après redirection.
 */

const UA = 'Mozilla/5.0 (compatible; TracteursEtCoBot/1.0; +https://tracteursandco.fr)';
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_CHARS = 40_000;

export function isOfficialUrl(raw: string, domains: string[]) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (/^[\d.]+$/.test(host) || host.includes(':')) return false;
    // Sites de test ou de préproduction des constructeurs : jamais.
    if (/^(test|staging|stage|preprod|dev|qa|uat)[.-]/.test(host)) return false;
    return domains.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', deg: '°', sup2: '²', sup3: '³', times: '×', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»' };

/** HTML → texte lisible, en gardant la structure des tableaux (cellules séparées par « | »). */
export function htmlToText(html: string) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
  const text = html
    .replace(/<(script|style|noscript|svg|head|nav|footer|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<(br|\/tr|\/p|\/li|\/h\d|\/div|\/section|\/dt|\/dd|\/caption)[^>]*>/gi, '\n')
    .replace(/<h(\d)[^>]*>/gi, '\n## ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/(\| *){2,}/g, '| ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title: title.replace(/\s+/g, ' ').slice(0, 200), text: text.slice(0, MAX_CHARS) };
}

export type OfficialPage = { url: string; title: string; text: string; links?: string[]; /** Même page dans d'autres langues (hreflang). */ alternates?: string[]; /** Texte tiré des données JSON de la page (menus compris) : moins fiable. */ embedded?: boolean };

/**
 * Pages construites en JavaScript (ex. John Deere) : le contenu est embarqué dans le HTML
 * sous forme de données JSON. On en extrait les textes courts (intitulés et valeurs).
 */
export function embeddedText(html: string) {
  const decoded = html.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\"/g, '"');
  const values: string[] = [];
  const seen = new Set<string>();
  for (const m of decoded.matchAll(/"(?:text|value|label|name|title|description|unit|key|header|content|specName|specValue|displayValue)"\s*:\s*"([^"<>{}]{1,300})"/g)) {
    const v = m[1].replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    values.push(v);
  }
  return values.join('\n').slice(0, MAX_CHARS);
}

/**
 * Densité de données techniques : nombre de lignes qui contiennent à la fois un nombre et
 * une unité (kW, ch, Nm, mm, kg, l/min…), où qu'elle soit dans la ligne (les tableaux mettent
 * souvent l'unité dans l'intitulé : « Couple (Nm) | 497 | 536 »). Une vraie page de
 * caractéristiques en a des dizaines, une page de présentation presque aucune.
 */
export const specDensity = (text: string) =>
  text
    .split('\n')
    .filter((l) => /\d/.test(l) && /(\bkW\b|\bch\b|\bhp\b|\bPS\b|\bNm\b|\bmm\b|\bkg\b|\bdaN\b|l\/min|tr\/min|\brpm\b|km\/h|cm³|cm3|\bbar\b|\blitres?\b|\(l\)|\bl\b)/i.test(l)).length;

/** Brochure PDF : on ne garde que les pages riches en données (le tableau technique, souvent en fin de brochure). */
async function pdfToText(buffer: ArrayBuffer) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = (text as string[]).map((t, i) => ({ i, t: t.replace(/[ \t]+/g, ' ').trim(), d: specDensity(t) }));
  const rich = pages.filter((p) => p.d >= 8).sort((a, b) => b.d - a.d);
  const kept: typeof pages = [];
  let total = 0;
  for (const p of rich) {
    if (total + p.t.length > MAX_CHARS) break;
    kept.push(p);
    total += p.t.length;
  }
  return kept
    .sort((a, b) => a.i - b.i)
    .map((p) => `## Page ${p.i + 1}\n${p.t}`)
    .join('\n\n');
}

export async function fetchOfficialPage(url: string, domains: string[]): Promise<OfficialPage | null> {
  if (!isOfficialUrl(url, domains)) return null;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/pdf', 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    if (!res.ok || !isOfficialUrl(res.url || url, domains)) return null;
    const type = res.headers.get('content-type') ?? '';
    const len = Number(res.headers.get('content-length') ?? 0);
    const finalUrl = res.url || url;

    if (/application\/pdf/i.test(type) || /\.pdf($|\?)/i.test(finalUrl)) {
      if (len > MAX_PDF_BYTES) return null;
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > MAX_PDF_BYTES) return null;
      const text = await pdfToText(buffer);
      const title = decodeURIComponent(finalUrl.split('/').pop() ?? 'brochure.pdf').slice(0, 120);
      return text.length > 300 ? { url: finalUrl, title: `Brochure PDF ${title}`, text } : null;
    }

    if (!/text\/html|application\/xhtml/i.test(type)) return null;
    if (len > MAX_BYTES) return null;
    const html = (await res.text()).slice(0, MAX_BYTES);
    const { title, text } = htmlToText(html);
    // Liens vers les brochures et fiches techniques (Claas, New Holland, Case IH…) : suivis ensuite.
    const links = [
      ...new Set(
        [...html.matchAll(/href="([^"#]+)"/g)]
          .map((m) => {
            try {
              return new URL(m[1].replace(/&amp;/g, '&'), finalUrl).toString();
            } catch {
              return '';
            }
          })
          .filter(
            (h) =>
              h &&
              h !== finalUrl &&
              /\.pdf($|\?)|\/media\/|\/api\/public\/content\/|brochure|techdata|donnees-techniques|technical-data|technische-daten|specification|caracteristiques/i.test(h) &&
              // Pas les images (vignettes « t=size… », fichiers image).
              !/[?&]t=size|\.(jpe?g|png|webp|gif|svg|avif)($|\?)/i.test(h) &&
              isOfficialUrl(h, domains),
          ),
      ),
    ].slice(0, 12);
    // Versions de la même page dans d'autres pays (la brochure n'est parfois liée que sur l'une d'elles).
    const alternates = [...html.matchAll(/<link[^>]+rel="alternate"[^>]*>/gi)]
      .map((m) => ({ lang: /hreflang="([^"]+)"/i.exec(m[0])?.[1]?.toLowerCase() ?? '', href: /href="([^"]+)"/i.exec(m[0])?.[1]?.replace(/&amp;/g, '&') ?? '' }))
      .filter((a) => a.href && a.href !== finalUrl && isOfficialUrl(a.href, domains))
      .sort((a, b) => ['en-gb', 'en', 'en-ie', 'de-de', 'de'].indexOf(a.lang) + 100 * Number(!['en-gb', 'en', 'en-ie', 'de-de', 'de'].includes(a.lang)) - (['en-gb', 'en', 'en-ie', 'de-de', 'de'].indexOf(b.lang) + 100 * Number(!['en-gb', 'en', 'en-ie', 'de-de', 'de'].includes(b.lang))))
      .map((a) => a.href)
      .slice(0, 3);
    // Peu de données visibles : contenu peut-être embarqué en JSON (site en JavaScript).
    if (specDensity(text) < 15) {
      const embedded = embeddedText(html);
      if (specDensity(embedded) > specDensity(text)) return { url: finalUrl, title, text: `${text}\n\n## Données de la page\n${embedded}`.slice(0, MAX_CHARS), links, alternates, embedded: true };
    }
    return text.length > 300 || links.length ? { url: finalUrl, title, text, links, alternates } : null;
  } catch (err) {
    console.warn('[page officielle] lecture impossible', url, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Classe les adresses : pages de données techniques d'abord, en français de préférence.
 * Une même page dans plusieurs langues (ex. api.fendt.com/techdata/DE/de/… et /FR/fr/…)
 * n'est gardée qu'une fois : les variantes par pays (pneus, largeurs) se contredisent.
 */
export function rankSpecUrls(urls: string[]) {
  const isFr = (u: string) => /\/fr(\/|$|-)|\/FR\/fr\/|\.fr\//i.test(u);
  const score = (u: string) =>
    (/techdata|technical-data|technische-daten|donnees-techniques|caracteristiques|specifications?|specs?\b/i.test(u) ? 10 : 0) +
    (isFr(u) ? 5 : 0) +
    // Documents hébergés (brochures Claas, CNH…) : souvent le tableau complet.
    (/\/api\/public\/content\/|\/caas\/[^/]+\/media\//i.test(u) ? 8 : 0) +
    // Brochures PDF acceptées (Claas…), mais après une vraie page de données techniques.
    (/\.pdf($|\?)/i.test(u) ? 3 : 0);
  // Clé d'une page sans sa langue : /techdata/XX/xx/1551551 → /techdata/1551551.
  const key = (u: string) => {
    try {
      const { hostname, pathname } = new URL(u);
      const path = pathname.replace(/\/[a-z]{2}\/[a-z]{2}(?=\/)/i, '').replace(/\/(fr|en|de|it|es|nl|pl)(?=\/)/i, '');
      // Pages techdata : le dernier segment est le nom de la série, traduit selon la langue.
      return `${hostname}${/techdata/i.test(path) ? path.replace(/\/[^/]*$/, '') : path}${new URL(u).search}`;
    } catch {
      return u;
    }
  };
  const seen = new Set<string>();
  return [...new Set(urls)]
    .sort((a, b) => score(b) - score(a))
    .filter((u) => {
      const k = key(u);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}
