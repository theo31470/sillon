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

export type OfficialPage = { url: string; title: string; text: string };

/** Nombre de lignes de tableau (« | ») : une vraie page de données techniques en a beaucoup. */
export const tableRows = (text: string) => text.split('\n').filter((l) => (l.match(/\|/g) ?? []).length >= 2).length;

export async function fetchOfficialPage(url: string, domains: string[]): Promise<OfficialPage | null> {
  if (!isOfficialUrl(url, domains)) return null;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    if (!res.ok || !isOfficialUrl(res.url || url, domains)) return null;
    const type = res.headers.get('content-type') ?? '';
    // Les brochures PDF sont trop longues (et chères) à faire lire : on s'en tient aux pages.
    if (!/text\/html|application\/xhtml/i.test(type)) return null;
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > MAX_BYTES) return null;
    const html = (await res.text()).slice(0, MAX_BYTES);
    const { title, text } = htmlToText(html);
    return text.length > 300 ? { url: res.url || url, title, text } : null;
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
    (/\.pdf($|\?)/i.test(u) ? -20 : 0);
  // Clé d'une page sans sa langue : /techdata/XX/xx/1551551 → /techdata/1551551.
  const key = (u: string) => {
    try {
      const { hostname, pathname } = new URL(u);
      return `${hostname}${pathname.replace(/\/[a-z]{2}\/[a-z]{2}(?=\/)/i, '').replace(/\/(fr|en|de|it|es|nl|pl)(?=\/)/i, '').replace(/\/[^/]*$/, '')}`;
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
