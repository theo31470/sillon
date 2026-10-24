import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Proxy (ex-middleware) : s'exécute avant chaque page.
 *  1. rafraîchit la session Supabase et réécrit les cookies ;
 *  2. fait une vérification « optimiste » : sans session, on renvoie vers la
 *     connexion. La vraie vérification des droits est refaite côté serveur
 *     dans chaque page et action (src/lib/auth.ts) ET dans la base (RLS).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Doit être appelé tôt : valide le jeton et le rafraîchit si besoin.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const path = request.nextUrl.pathname;

  const needsLogin = path.startsWith('/app') || path.startsWith('/admin') || path.startsWith('/securite');
  if (needsLogin && !claims) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/connexion';
    loginUrl.search = `?suite=${encodeURIComponent(path)}`;
    return NextResponse.redirect(loginUrl);
  }

  if (path.startsWith('/admin') && claims?.aal !== 'aal2') {
    const mfaUrl = request.nextUrl.clone();
    mfaUrl.pathname = '/securite/2fa';
    mfaUrl.search = `?suite=${encodeURIComponent(path)}`;
    return NextResponse.redirect(mfaUrl);
  }

  if (needsLogin) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
}

export const config = {
  matcher: [
    // Tout sauf les fichiers statiques, les images et les routes API
    // (les routes API vérifient elles-mêmes l'authentification).
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
};
