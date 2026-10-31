import { NextResponse, type NextRequest } from 'next/server';
import { isReferralCodeFormat, REFERRAL_COOKIE } from '@/lib/referrals';

/**
 * Lien de parrainage (tracteursandco.fr/p/CODE) : retient le code 60 jours dans
 * un cookie, puis mène à l'inscription. Le code est proposé automatiquement au
 * moment de souscrire ; il reste vérifié côté serveur à ce moment-là.
 */
export async function GET(request: NextRequest, ctx: RouteContext<'/p/[code]'>) {
  const { code } = await ctx.params;
  const clean = decodeURIComponent(code).trim().toUpperCase();
  const target = new URL(isReferralCodeFormat(clean) ? `/inscription?parrain=${clean}` : '/', request.nextUrl.origin);
  const res = NextResponse.redirect(target, 303);
  if (isReferralCodeFormat(clean)) {
    res.cookies.set(REFERRAL_COOKIE, clean, { maxAge: 60 * 86400, httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:', path: '/' });
  }
  return res;
}
