import { createBrowserClient } from '@supabase/ssr';

/** Client Supabase côté navigateur (utilisé uniquement pour la double authentification). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
