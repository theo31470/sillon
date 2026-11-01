import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { DEMO_EMAIL, ensureDemoUser, seedDemo, unlockDemoUser } from '@/lib/demo';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * « Voir la démo » : ouvre une session sur le compte d'exemple, sans mot de passe
 * (lien de connexion à usage unique généré côté serveur, jamais envoyé par e-mail).
 */
export async function GET(request: NextRequest) {
  const home = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  // Déjà connecté (avec son propre compte ou la démo) : on va directement à l'espace.
  if (claims?.claims) return home('/app');

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'inconnue';
  if (!rateLimit(`demo:${ip}`, 20, 60 * 60_000).ok) return home('/?demo=occupee');

  try {
    const userId = await ensureDemoUser();
    await Promise.all([seedDemo(userId), unlockDemoUser(userId)]);
    const { data, error } = await createServiceClient().auth.admin.generateLink({ type: 'magiclink', email: DEMO_EMAIL });
    if (error || !data?.properties?.hashed_token) throw new Error(error?.message ?? 'lien indisponible');
    const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
    if (otpError) throw new Error(otpError.message);
  } catch (err) {
    console.error('[démo]', err);
    return home('/?demo=indisponible');
  }
  return home('/app?demo=1');
}
