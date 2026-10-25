import { NextResponse, type NextRequest } from 'next/server';
import { LIST_COLUMN, updatePrefsByToken } from '@/lib/email/preferences';
import { rateLimit } from '@/lib/rate-limit';
import type { EmailList } from '@/lib/email/send';

export const dynamic = 'force-dynamic';

/**
 * Désinscription « en un clic » (norme RFC 8058, utilisée par Gmail et
 * Apple Mail via l'en-tête List-Unsubscribe) : POST sans confirmation.
 * Un simple clic sur le lien (GET) mène à la page des préférences.
 */

function parse(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t');
  const liste = request.nextUrl.searchParams.get('liste');
  const list = liste === 'rappels' || liste === 'annonces' ? (liste as EmailList) : null;
  return { token, list };
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'inconnue';
  if (!rateLimit(`desinscription:${ip}`, 30, 60 * 60_000).ok) return NextResponse.json({ ok: false }, { status: 429 });
  const { token, list } = parse(request);
  if (!token || !list) return NextResponse.json({ ok: false }, { status: 400 });
  const ok = await updatePrefsByToken(token, { [LIST_COLUMN[list]]: false });
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}

export async function GET(request: NextRequest) {
  const { token, list } = parse(request);
  const url = new URL('/preferences-e-mail', request.nextUrl.origin);
  if (token) url.searchParams.set('t', token);
  if (list) url.searchParams.set('liste', list);
  return NextResponse.redirect(url);
}
