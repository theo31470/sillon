import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { brandDomains } from '@/lib/ai-web';
import { htmlToText, isOfficialUrl, specDensity } from '@/lib/official-pages';

/**
 * OUTIL DE MISE AU POINT TEMPORAIRE (import des fiches) : télécharge une page
 * officielle d'une marque et renvoie ce que le site en voit. Désactivé sans
 * PROBE_TOKEN ; limité aux domaines officiels des marques. À supprimer.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const token = process.env.PROBE_TOKEN ?? '';
  const given = request.nextUrl.searchParams.get('t') ?? '';
  if (token.length < 20 || given.length !== token.length || !timingSafeEqual(Buffer.from(given), Buffer.from(token))) {
    return NextResponse.json({ error: 'non' }, { status: 404 });
  }
  const url = request.nextUrl.searchParams.get('url') ?? '';
  const brand = request.nextUrl.searchParams.get('marque') ?? '';
  const extra = (request.nextUrl.searchParams.get('domaines') ?? '').split(',').filter(Boolean);
  const domains = [...brandDomains(brand), ...extra.filter((d) => /\.(sitecorecontenthub\.cloud|cloudfront\.net)$/.test(d))];
  if (!isOfficialUrl(url, domains)) return NextResponse.json({ error: 'domaine non officiel', domains }, { status: 400 });

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TracteursEtCoBot/1.0; +https://tracteursandco.fr)', Accept: 'text/html,application/pdf,*/*', 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
  });
  const type = res.headers.get('content-type') ?? '';
  const out: Record<string, unknown> = { status: res.status, finalUrl: res.url, type };
  if (/pdf/i.test(type)) {
    const buf = await res.arrayBuffer();
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = (text as string[]).map((t, i) => ({ page: i + 1, density: specDensity(t), chars: t.length }));
    out.bytes = buf.byteLength;
    out.totalPages = totalPages;
    out.richPages = pages.filter((p) => p.density >= 8);
    const best = pages.sort((a, b) => b.density - a.density)[0];
    out.bestPageSample = best ? (text as string[])[best.page - 1].slice(0, 2500) : '';
  } else {
    const html = await res.text();
    const { title, text } = htmlToText(html);
    out.bytes = html.length;
    out.title = title;
    out.density = specDensity(text);
    out.textSample = text.slice(0, 2500);
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => /pdf|brochure|media|content|spec|techdata|download|technique/i.test(h));
    out.links = [...new Set(links)].slice(0, 40);
    // Données embarquées (JSON) : contexte autour de mots-clés techniques.
    const hits = [...html.matchAll(/(kW|Nm|l\/min|Puissance|horsepower|Displacement|Cylindrée)/gi)].slice(0, 6).map((m) => html.slice(Math.max(0, (m.index ?? 0) - 200), (m.index ?? 0) + 200));
    out.rawHits = hits;
    out.scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]).slice(0, 15);
  }
  return NextResponse.json(out);
}
