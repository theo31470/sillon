import 'server-only';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';

/** Informations de facturation d'un membre (table billing_details). */
export type BillingDetails = {
  name: string;
  line1: string;
  line2: string;
  postal_code: string;
  city: string;
  country: string;
  siret: string;
  vat_number: string;
};

export const EMPTY_BILLING: BillingDetails = { name: '', line1: '', line2: '', postal_code: '', city: '', country: 'FR', siret: '', vat_number: '' };

const digits = (s: string) => s.replace(/\s+/g, '');

export const billingSchema = z
  .object({
    name: z.string().trim().min(2, 'Indiquez le nom ou la raison sociale à faire figurer sur les factures.').max(120),
    line1: z.string().trim().min(3, 'Indiquez l’adresse.').max(200),
    line2: z.string().trim().max(200).default(''),
    postal_code: z.string().trim().min(4, 'Code postal incomplet.').max(20),
    city: z.string().trim().min(2, 'Indiquez la commune.').max(100),
    country: z.enum(['FR', 'BE', 'CH', 'LU', 'DE', 'ES', 'IT']).default('FR'),
    siret: z
      .string()
      .trim()
      .transform(digits)
      .refine((s) => s === '' || /^\d{14}$/.test(s), 'Le SIRET compte 14 chiffres.')
      .default(''),
    vat_number: z
      .string()
      .trim()
      .transform((s) => digits(s).toUpperCase())
      .refine((s) => s === '' || /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(s), 'Numéro de TVA intracommunautaire invalide (ex. FR12345678901).')
      .default(''),
  })
  .superRefine((v, ctx) => {
    if (v.country === 'FR' && !/^\d{5}$/.test(v.postal_code)) ctx.addIssue({ code: 'custom', path: ['postal_code'], message: 'Code postal à 5 chiffres.' });
  });

export function billingFromForm(formData: FormData) {
  return billingSchema.safeParse({
    name: formData.get('billing_name') ?? '',
    line1: formData.get('billing_line1') ?? '',
    line2: formData.get('billing_line2') ?? '',
    postal_code: formData.get('billing_postal_code') ?? '',
    city: formData.get('billing_city') ?? '',
    country: formData.get('billing_country') || 'FR',
    siret: formData.get('billing_siret') ?? '',
    vat_number: formData.get('billing_vat') ?? '',
  });
}

export async function getBillingDetails(userId: string): Promise<BillingDetails | null> {
  const { data } = await createServiceClient()
    .from('billing_details')
    .select('name, line1, line2, postal_code, city, country, siret, vat_number')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as BillingDetails | null) ?? null;
}

/** Enregistre les informations de facturation et les recopie sur le client Stripe (adresse des paiements). */
export async function saveBillingDetails(userId: string, details: BillingDetails, stripeCustomerId: string | null) {
  const { error } = await createServiceClient().from('billing_details').upsert({ user_id: userId, ...details });
  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);
  if (stripeCustomerId) {
    await stripe().customers.update(stripeCustomerId, {
      name: details.name,
      address: { line1: details.line1, line2: details.line2 || undefined, postal_code: details.postal_code, city: details.city, country: details.country },
    });
  }
}
