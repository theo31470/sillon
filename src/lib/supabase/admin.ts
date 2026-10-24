import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Client « service role » : il CONTOURNE les règles RLS.
 * À n'utiliser que côté serveur, après avoir vérifié les droits de l'appelant
 * (webhook Stripe signé, admin vérifié, écriture du journal).
 * L'import de 'server-only' empêche toute inclusion dans le code du navigateur.
 */
export function createServiceClient() {
  return createClient(env.supabaseUrl(), env.supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
