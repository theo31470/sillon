import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/**
 * Client Supabase côté serveur, au nom de l'utilisateur connecté.
 * Les règles RLS de la base s'appliquent : il ne voit que ce qu'il a le droit de voir.
 * Un nouveau client doit être créé pour chaque requête.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl(), env.supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Appelé depuis un composant serveur : l'écriture est impossible ici,
          // le proxy se charge de rafraîchir la session.
        }
      },
    },
  });
}
