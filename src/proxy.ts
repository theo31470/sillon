import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { bypassesMaintenance, MAINTENANCE_OFF, parseMaintenance, type MaintenanceState } from '@/lib/maintenance-mode';

// État de maintenance gardé 15 secondes par instance : une seule lecture en base par instance et par quart de minute.
let maintenanceCache: { at: number; state: MaintenanceState } | null = null;
const adminCache = new Map<string, { at: number; admin: boolean }>();

/**
 * Proxy (ex-middleware) : s'exécute avant chaque page.
 *  1. rafraîchit la session Supabase et réécrit les cookies ;
 *  2. fait une vérification « optimiste » : sans session, on renvoie vers la
 *     connexion. La vraie vérification des droits est refaite côté serveur
 *     dans chaque page et action (src/lib/auth.ts) ET dans la base (RLS) ;
 *  3. mode maintenance : les visiteurs et membres voient /maintenance (503),
 *     les administrateurs continuent de naviguer normalement.
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

  // Mode maintenance (sauf administrateurs et pages de connexion).
  if (!bypassesMaintenance(path)) {
    if (!maintenanceCache || Date.now() - maintenanceCache.at > 15_000) {
      const { data: row } = await supabase.from('site_settings').select('value').eq('key', 'maintenance').maybeSingle();
      maintenanceCache = { at: Date.now(), state: row ? parseMaintenance(row.value) : MAINTENANCE_OFF };
    }
    if (maintenanceCache.state.active) {
      let admin = false;
      const sub = typeof claims?.sub === 'string' ? claims.sub : null;
      if (sub) {
        const known = adminCache.get(sub);
        if (known && Date.now() - known.at < 60_000) admin = known.admin;
        else {
          const { data: p } = await supabase.from('profiles').select('role').eq('id', sub).maybeSingle();
          admin = p?.role === 'admin';
          adminCache.set(sub, { at: Date.now(), admin });
          if (adminCache.size > 500) adminCache.clear();
        }
      }
      if (!admin) {
        const target = request.nextUrl.clone();
        target.pathname = '/maintenance';
        target.search = '';
        const rewrite = NextResponse.rewrite(target, { status: 503 });
        rewrite.headers.set('Retry-After', '1800');
        rewrite.headers.set('Cache-Control', 'no-store');
        response.cookies.getAll().forEach((c) => rewrite.cookies.set(c));
        return rewrite;
      }
    }
  }

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
