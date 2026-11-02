import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getSellerAccount, refreshSellerAccount } from '@/lib/bourse-pay';
import { BUYER_FEE, RELEASE_DAYS_AFTER_SHIPPING } from '@/lib/bourse-shared';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Card, Notice } from '@/components/ui';
import { openPayoutDashboard, startOnboarding } from './actions';

export const metadata: Metadata = { title: 'Recevoir des paiements · Bourse' };

export default async function PayoutsPage(props: PageProps<'/app/annonces/versements'>) {
  const { session } = await requireUser('/app/annonces/versements');
  const { erreur, retour } = await props.searchParams;
  // État relu chez Stripe à chaque visite (retour du formulaire compris).
  const account = (await getSellerAccount(session.userId)) ? await refreshSellerAccount(session.userId).catch(() => getSellerAccount(session.userId)) : null;
  const ready = Boolean(account?.payouts_enabled);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recevoir des paiements</h1>
          <p className="max-w-3xl text-muted">Activez le paiement sécurisé : vos acheteurs paient sur le site, et l’argent arrive sur votre compte bancaire après la remise ou la réception.</p>
        </div>
        <Link href="/app/annonces" className="font-semibold text-brand-dark hover:underline">← Mes annonces</Link>
      </div>
      {erreur === 'stripe' ? <Notice tone="red">Le service de paiement ne répond pas pour le moment. Réessayez dans quelques minutes.</Notice> : null}
      {erreur === 'patience' ? <Notice>Un instant : réessayez dans quelques minutes.</Notice> : null}
      {retour && ready ? <Notice tone="green">C’est prêt : le paiement sécurisé est activé sur toutes vos annonces.</Notice> : null}
      {retour && !ready && account ? <Notice>Merci ! Stripe vérifie vos informations : cela prend en général quelques minutes, parfois un jour ouvré.</Notice> : null}

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">Votre compte de versement</h2>
          {ready ? <Badge tone="green">Activé</Badge> : account?.details_submitted ? <Badge tone="amber">En vérification</Badge> : <Badge tone="gray">À activer</Badge>}
        </div>
        {ready ? (
          <>
            <p className="text-muted">Les acheteurs peuvent payer vos annonces sur le site. Vos ventes sont versées sur votre compte bancaire, sans frais pour vous.</p>
            <form action={openPayoutDashboard}>
              <SubmitButton variant="secondary" pendingLabel="Ouverture…">Voir mes virements et mon compte bancaire</SubmitButton>
            </form>
          </>
        ) : (
          <>
            <p className="text-muted">
              Notre partenaire de paiement Stripe vous demande, une seule fois, votre identité et le RIB du compte où recevoir l’argent. C’est une obligation légale contre la fraude :
              Tracteurs & Co ne voit jamais vos coordonnées bancaires. Comptez 5 minutes.
            </p>
            {account?.requirements_due.length ? <p className="text-sm text-muted">Il reste {account.requirements_due.length} information{account.requirements_due.length > 1 ? 's' : ''} à compléter chez Stripe.</p> : null}
            <form action={startOnboarding}>
              <SubmitButton pendingLabel="Ouverture de Stripe…">{account ? 'Terminer mon inscription' : 'Activer le paiement sécurisé'}</SubmitButton>
            </form>
          </>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-xl font-semibold">Comment ça marche</h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {[
            ['L’acheteur paie sur le site', `Par carte, Apple Pay, Google Pay ou PayPal. Il paie en plus de petits frais de service (${(BUYER_FEE.fixed / 100).toFixed(2).replace('.', ',')} € + ${BUYER_FEE.rate * 100} %) : vous touchez le prix affiché.`],
            ['L’argent est mis de côté', 'L’annonce passe « réservée ». L’argent est conservé tant que l’acheteur n’a pas le matériel : il ne risque rien, vous non plus.'],
            ['Vous êtes payé', `En main propre, dès que vous saisissez le code que l’acheteur vous donne. En envoi, dès qu’il confirme la réception (au plus tard ${RELEASE_DAYS_AFTER_SHIPPING} jours après l’expédition).`],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="flex size-9 flex-none items-center justify-center rounded-full bg-brand font-bold text-on-brand">{i + 1}</span>
              <span>
                <span className="block font-semibold">{t}</span>
                <span className="text-sm text-muted">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
