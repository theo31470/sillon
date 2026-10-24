// Accès centralisé aux variables d'environnement.
// Les valeurs sont lues au moment de l'appel (et non au chargement du module)
// pour que le build fonctionne même sans les clés, et qu'une clé manquante
// produise un message clair au lieu d'une erreur obscure.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
  }
  return value;
}

export const env = {
  siteUrl: () => process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL'),
  supabasePublishableKey: () => required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  supabaseSecretKey: () => required('SUPABASE_SECRET_KEY'),
  stripeSecretKey: () => required('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: () => required('STRIPE_WEBHOOK_SECRET'),
  stripePriceComplet: () => required('STRIPE_PRICE_COMPLET'),
  anthropicApiKey: () => required('ANTHROPIC_API_KEY'),
  anthropicModel: () => process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
};
