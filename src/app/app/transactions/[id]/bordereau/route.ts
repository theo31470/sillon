import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { labelLink } from '@/lib/bourse-pay';

export const dynamic = 'force-dynamic';

/** Bordereau PDF du vendeur : le lien Boxtal (temporaire) est redemandé à chaque clic. */
export async function GET(request: Request, ctx: RouteContext<'/app/transactions/[id]/bordereau'>) {
  const { id } = await ctx.params;
  const back = new URL(`/app/transactions/${id}`, request.url);
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL(`/connexion?suite=${encodeURIComponent(back.pathname)}`, request.url));
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(back);
  const url = await labelLink(id, session.userId).catch((err) => {
    console.error('[bourse] bordereau', id, err);
    return null;
  });
  if (!url) {
    back.searchParams.set('bordereau', 'attente');
    return NextResponse.redirect(back);
  }
  return NextResponse.redirect(url);
}
