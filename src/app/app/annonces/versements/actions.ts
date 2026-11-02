'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { sellerDashboardUrl, sellerOnboardingUrl } from '@/lib/bourse-pay';

/** Ouvre le formulaire Stripe pour recevoir les paiements de la bourse. */
export async function startOnboarding() {
  const { session, profile } = await requireUser('/app/annonces/versements');
  if (!rateLimit(`versements:${session.userId}`, 10, 10 * 60_000).ok) redirect('/app/annonces/versements?erreur=patience');
  let url: string;
  try {
    url = await sellerOnboardingUrl(session.userId, profile.email);
  } catch (err) {
    console.error('[bourse] inscription vendeur', err);
    redirect('/app/annonces/versements?erreur=stripe');
  }
  redirect(url);
}

/** Tableau de bord Stripe du vendeur (virements, compte bancaire). */
export async function openPayoutDashboard() {
  const { session } = await requireUser('/app/annonces/versements');
  const url = await sellerDashboardUrl(session.userId).catch(() => null);
  redirect(url ?? '/app/annonces/versements?erreur=stripe');
}
