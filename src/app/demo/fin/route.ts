import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Sortie de la démo (bouton « Créer mon compte », ou toute action qui voudrait
 * enregistrer quelque chose) : on ferme la session de démonstration de ce
 * navigateur seulement, puis on mène à l'inscription.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    const { data: p } = await supabase.from('profiles').select('is_demo').eq('id', data.claims.sub).maybeSingle();
    if (p?.is_demo) await supabase.auth.signOut({ scope: 'local' });
  }
  const to = request.nextUrl.searchParams.get('vers') === 'accueil' ? '/' : '/inscription?demo=1';
  return NextResponse.redirect(new URL(to, request.nextUrl.origin), 303);
}
