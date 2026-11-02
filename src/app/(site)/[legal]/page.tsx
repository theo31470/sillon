import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PHOTO_CREDITS } from '@/lib/photo-credits';
import { SITE } from '@/lib/site';
import { SHOP_MEMBER_DISCOUNT } from '@/lib/shop-shared';
import { ANNUAL_DISCOUNT, COMPLET_PRICES, DIAGNOSTIC_DAILY_LIMIT, DIAGNOSTIC_MONTHLY_LIMIT, FREE_MACHINE_LIMIT, INVOICE_READINGS_MONTHLY, TEAM_GUESTS, TRIAL_DAYS } from '@/lib/plans';

/**
 * Pages légales. Base rédigée pour une micro-entreprise : à faire relire par
 * un professionnel (juriste, expert-comptable) avant l'ouverture au public.
 * Les éléments entre crochets viennent de src/lib/site.ts.
 */

type Section = { h: string; p: string[]; id?: string };
type LegalPage = { title: string; intro?: string; sections: Section[] };

const E = SITE.editor;
const UPDATED = '1er novembre 2026';
const CONTACT = SITE.contactEmail;

const pages: Record<string, LegalPage> = {
  'mentions-legales': {
    title: 'Mentions légales',
    sections: [
      {
        h: 'Éditeur du site',
        p: [
          `${SITE.domain} est édité par ${E.name}, ${E.status.toLowerCase()}.`,
          `SIRET : ${E.siret}. Adresse : ${E.address}.${E.phone ? ` Téléphone : ${E.phone}.` : ''} E-mail : ${CONTACT}.`,
          `Directeur de la publication : ${E.name}.`,
          `${SITE.vatMention}.`,
        ],
      },
      {
        h: 'Hébergement',
        p: [
          'Site : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis (vercel.com).',
          'Base de données et comptes : Supabase, serveurs situés à Paris (Union européenne).',
        ],
      },
      {
        h: 'Propriété intellectuelle',
        p: [
          'Les textes, le logo, la charte graphique et les illustrations de Tracteurs & Co sont protégés. Toute reproduction sans autorisation est interdite.',
          'Les marques et modèles de machines cités appartiennent à leurs propriétaires respectifs et ne sont mentionnés qu’à titre d’information. Tracteurs & Co n’est lié à aucun constructeur.',
        ],
      },
    ],
  },

  confidentialite: {
    title: 'Politique de confidentialité',
    intro: `Dernière mise à jour : ${UPDATED}. Cette page explique quelles données nous collectons, pourquoi, et comment exercer vos droits.`,
    sections: [
      {
        h: 'Responsable du traitement',
        p: [`${E.name}, ${E.status.toLowerCase()}, ${E.address}. Contact : ${CONTACT}.`],
      },
      {
        h: 'Données collectées',
        p: [
          'Votre compte : nom, nom de l’exploitation, adresse e-mail, mot de passe (stocké sous forme chiffrée, jamais lisible).',
          'Votre parc matériel : machines, relevés de compteur, entretiens, dépenses et réglages que vous saisissez. Si vous partagez votre parc, les personnes invitées voient les machines et leur carnet d’entretien (jamais les dépenses), et leurs saisies portent leur nom.',
          'L’abonnement : informations de facturation (nom ou raison sociale, adresse, SIRET et numéro de TVA s’il y a lieu), historique des paiements, factures et avoirs. Les numéros de carte bancaire sont saisis dans un formulaire sécurisé de Stripe et ne passent jamais par Tracteurs & Co.',
          'La sécurité : journal technique des connexions et actions sensibles (adresse IP comprise), pour détecter les abus.',
          'Le formulaire de contact : nom, adresse e-mail, et si vous les indiquez téléphone et exploitation, avec votre message, pour vous répondre.',
          'La boutique : articles commandés, adresse de livraison et téléphone saisis au paiement, pour préparer, expédier et suivre la commande.',
          'La bourse au matériel : vos annonces (publiques, avec votre prénom, l’initiale de votre nom, votre commune et votre département), vos messages avec les autres membres, vos favoris et vos signalements. Pour l’estimation du prix de revente, la marque, le modèle, l’année et les heures de la machine sont transmis à l’intelligence artificielle Claude, qui cherche des prix publics. Pour un achat en paiement sécurisé, l’adresse de livraison et le téléphone de l’acheteur sont communiqués au seul vendeur, pour l’envoi ; le vendeur qui active les versements transmet son identité et son RIB directement à Stripe.',
        ],
      },
      {
        h: 'Pourquoi ces données',
        p: [
          'Fournir le service (carnet d’entretien, rappels, coût de revient, rapports) : exécution du contrat.',
          'Facturer l’abonnement et tenir la comptabilité : obligation légale.',
          'Traiter vos commandes de la boutique (fabrication, livraison, service après-vente) : exécution du contrat.',
          'Sécuriser les comptes et le site : intérêt légitime.',
          'Vous envoyer quelques nouveautés et conseils : intérêt légitime, désactivable à tout moment.',
          'Vos données ne sont jamais vendues ni utilisées pour de la publicité.',
        ],
      },
      {
        h: 'Prestataires',
        p: [
          'Vercel (hébergement du site, États-Unis), Supabase (base de données, Paris), Resend (envoi des e-mails, serveurs en Irlande), Stripe (paiements, Irlande), Printful (fabrication et expédition des commandes de la boutique, Lettonie et États-Unis : il reçoit le nom, l’adresse de livraison, l’e-mail et le téléphone de l’acheteur).',
          'Anthropic (États-Unis) : l’aide au diagnostic transmet à l’intelligence artificielle Claude la description de panne que vous saisissez, et la lecture des factures d’atelier lui transmet la photo ou le PDF de la facture. N’y indiquez pas d’informations personnelles. Les factures ne sont pas conservées par Tracteurs & Co : seules les informations que vous validez sont enregistrées.',
          'Les transferts hors de l’Union européenne sont encadrés par les garanties prévues par le RGPD (clauses contractuelles types ou cadre de protection des données UE–États-Unis).',
        ],
      },
      {
        h: 'Durée de conservation',
        p: [
          'Vos données sont conservées tant que votre compte est actif et supprimées lorsque vous supprimez votre compte, sauf les factures, conservées 10 ans (obligation comptable).',
          'Les messages envoyés par le formulaire de contact sont conservés 3 ans au plus après notre dernier échange, puis effacés.',
        ],
      },
      {
        h: 'E-mails',
        p: [
          'Les e-mails de compte (confirmation, mot de passe), de facturation et de suivi de vos demandes (fiche technique demandée mise en ligne) sont toujours envoyés. Les rappels d’entretien et les nouveautés se désactivent à tout moment : lien « Gérer mes e-mails » en bas de chaque message, ou rubrique « Mon compte ».',
          'Les nouveautés comprennent au plus deux messages de conseil aux comptes gratuits : quand la limite de machines est atteinte, et après deux semaines sans visite. Chacun n’est envoyé qu’une fois.',
        ],
      },
      {
        h: 'Cookies',
        p: [
          'Le site n’utilise que des cookies indispensables (maintien de votre connexion) et mémorise votre choix de thème clair ou sombre sur votre appareil. Si vous arrivez par le lien d’invitation d’un membre, le code de parrainage est retenu 60 jours pour vous être proposé au moment de vous abonner. Aucun cookie publicitaire ni de mesure d’audience : aucun consentement n’est donc demandé.',
        ],
      },
      {
        h: 'Vos droits',
        p: [
          'Vous pouvez accéder à vos données, les corriger, les exporter (bouton « Télécharger mes données » dans « Mon compte ») et les supprimer (« Supprimer mon compte »). Pour toute autre demande : ' + CONTACT + '.',
          'Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL (cnil.fr).',
        ],
      },
    ],
  },

  conditions: {
    title: 'Conditions générales d’utilisation et de vente',
    intro: `Dernière mise à jour : ${UPDATED}. En créant un compte, vous acceptez ces conditions.`,
    sections: [
      {
        h: '1. Le service',
        p: [
          `Tracteurs & Co, édité par ${E.name} (${E.status.toLowerCase()}), est un outil en ligne de suivi du matériel agricole : carnet d’entretien, rappels, relevés de compteur, dépenses, coût de revient, fiches techniques et aide au diagnostic.`,
          'Le service est réservé aux professionnels : exploitants agricoles, CUMA, GAEC, entreprises de travaux agricoles et toute personne agissant dans le cadre de son activité professionnelle. En créant un compte, vous déclarez agir à ce titre. Les règles du Code de la consommation propres aux consommateurs (droit de rétractation, médiation de la consommation) ne s’appliquent donc pas.',
        ],
      },
      {
        h: '2. Compte',
        p: [
          'Vous êtes responsable de la confidentialité de votre mot de passe et des informations que vous saisissez. Nous recommandons d’activer la double authentification.',
          'Nous pouvons suspendre un compte en cas d’usage frauduleux ou contraire à ces conditions.',
        ],
      },
      {
        h: '3. Formules et prix',
        p: [
          `Formule Gratuit : jusqu’à ${FREE_MACHINE_LIMIT} machines, sans limite de durée.`,
          `Formule Complet : ${COMPLET_PRICES.mensuel.label} par mois, ou ${COMPLET_PRICES.annuel.label} par an (soit −${ANNUAL_DISCOUNT} %). Prix TTC, ${SITE.vatMention}.`,
          `La formule Complet comprend jusqu’à ${DIAGNOSTIC_MONTHLY_LIMIT} aides au diagnostic par mois (et ${DIAGNOSTIC_DAILY_LIMIT} par 24 heures) et ${INVOICE_READINGS_MONTHLY} lectures de factures d’atelier par mois, pour garantir un usage raisonnable du service. Le titulaire peut partager son parc avec ${TEAM_GUESTS} personnes, sous sa responsabilité ; il peut retirer leur accès à tout moment.`,
          `Un premier abonnement commence par ${TRIAL_DAYS} jours d’essai gratuit. Sans résiliation pendant l’essai, l’abonnement démarre à la fin de celui-ci.`,
          'Le paiement se fait par carte bancaire, sur la page « Abonnement », via un formulaire sécurisé de notre prestataire de paiement Stripe, au début de chaque période. L’abonnement se renouvelle automatiquement pour la même durée.',
          `Une facture ${SITE.name} est émise à chaque paiement et envoyée par e-mail ; toutes les factures sont téléchargeables depuis la page « Abonnement ». Un remboursement donne lieu à un avoir.`,
          'Le passage du mensuel à l’annuel (ou l’inverse) s’applique à la prochaine échéance, sans double paiement ; pendant l’essai gratuit, il s’applique dès la fin de l’essai.',
          'Toute évolution de prix vous est annoncée par e-mail au moins 30 jours avant de s’appliquer, et vous pouvez résilier avant.',
          `Parrainage : chaque membre dispose d’un code personnel. La personne invitée bénéficie d’une remise de ${COMPLET_PRICES.mensuel.label} sur son premier paiement, en plus de l’essai gratuit, à condition qu’il s’agisse de son premier abonnement. Le parrain reçoit un crédit de ${COMPLET_PRICES.mensuel.label} après le premier paiement effectif de la personne invitée ; ce crédit est déduit de ses prochains paiements de la formule Complet et n’est ni remboursable ni convertible en argent. Un compte ne peut être parrainé qu’une fois, et un abus (comptes fictifs, auto-parrainage) entraîne l’annulation des crédits.`,
        ],
      },
      {
        h: '4. Résiliation',
        p: [
          'Vous pouvez résilier à tout moment depuis « Abonnement », en un clic. L’accès à la formule Complet reste ouvert jusqu’à la fin de la période déjà payée, puis votre compte repasse en formule Gratuit. La période en cours n’est pas remboursée.',
          'Vous pouvez aussi supprimer définitivement votre compte et vos données depuis « Mon compte ».',
        ],
      },
      {
        h: '5. Vos données',
        p: [
          'Les données que vous saisissez restent les vôtres. Vous pouvez les exporter à tout moment. Leur traitement est décrit dans la politique de confidentialité.',
        ],
      },
      {
        h: '6. Responsabilité',
        p: [
          'Les fiches techniques, intervalles d’entretien et aides au diagnostic sont donnés à titre indicatif, à partir de sources citées. Ils ne remplacent ni le manuel du constructeur ni l’avis d’un professionnel. Vérifiez toujours les valeurs avant une intervention.',
          'Le coût de revient est un calcul établi à partir de vos propres saisies : sa justesse dépend de celles-ci.',
          'Nous faisons le maximum pour que le service soit disponible et vos données sauvegardées, sans pouvoir garantir une disponibilité permanente. Notre responsabilité est limitée aux sommes payées au cours des 12 derniers mois.',
        ],
      },
      {
        h: '7. Boutique',
        id: 'boutique',
        p: [
          `La boutique (vêtements et objets aux couleurs de Tracteurs & Co) est réservée aux membres connectés. Les prix sont indiqués TTC, ${SITE.vatMention}. Les membres de la formule Complet bénéficient de ${SHOP_MEMBER_DISCOUNT} % de remise, déduits automatiquement ; la remise ne se cumule avec aucune autre offre.`,
          'Les articles sont fabriqués à la demande par notre partenaire d’impression Printful, puis expédiés depuis ses ateliers, le plus souvent en Europe. Livraison en France métropolitaine (Corse comprise) ; les frais et le délai de livraison estimés sont indiqués avant le paiement. Le paiement se fait par carte bancaire via Stripe ; la commande est confirmée par e-mail, puis le numéro de suivi est envoyé à l’expédition.',
          'Article défectueux, mal imprimé ou abîmé pendant le transport : signalez-le à ' + CONTACT + ' avec une photo dans les 30 jours suivant la réception. Il est remplacé ou remboursé, sans frais pour vous.',
          'Droit de rétractation : vous disposez de 14 jours après la réception pour nous informer, à ' + CONTACT + ', que vous renoncez à votre achat, sans avoir à vous justifier. L’article doit nous être renvoyé non porté et dans son état d’origine, dans les 14 jours suivants, à l’adresse que nous vous indiquerons ; les frais de retour sont à votre charge. Nous vous remboursons le prix payé et les frais de livraison standard au plus tard 14 jours après avoir reçu l’article.',
          'Les articles bénéficient de la garantie légale de conformité (articles L217-3 et suivants du Code de la consommation) et de la garantie contre les vices cachés (articles 1641 et suivants du Code civil).',
        ],
      },
      {
        h: '8. Bourse au matériel',
        id: 'bourse',
        p: [
          'La bourse permet aux membres de publier gratuitement des annonces de matériel agricole (machines, outils, pièces, pneus, outillage) et d’échanger avec les acheteurs par la messagerie du site. Tracteurs & Co héberge les annonces : la vente se conclut entre l’acheteur et le vendeur, qui en restent seuls responsables.',
          'Le vendeur garantit qu’il est propriétaire du bien ou autorisé à le vendre, que l’annonce, les photos et l’état décrit sont exacts, et publie une seule annonce par objet. Il signale s’il vend à titre professionnel. Sont interdits : tout bien hors du matériel agricole et de son outillage, les produits phytopharmaceutiques, les carburants, les animaux, les biens d’origine douteuse, et toute annonce trompeuse.',
          'L’annonce montre le prénom et l’initiale du nom du vendeur, sa commune et son département ; jamais son adresse, son téléphone ni son e-mail. Les messages ne sont lus que par les deux parties, et par l’équipe en cas de signalement.',
          'Tout membre peut signaler une annonce. L’équipe peut retirer une annonce contraire à ces règles et suspendre un compte en cas d’abus. Ne payez jamais par mandat, coupon ou virement à l’étranger.',
          'Paiement sécurisé. Lorsque le vendeur l’a activé, l’acheteur peut payer sur le site (carte bancaire, Apple Pay, Google Pay ou PayPal), jusqu’à 5 000 € par achat. Le paiement est traité par Stripe ; pour recevoir l’argent, le vendeur ouvre un compte de versement chez Stripe (vérification d’identité et RIB), et Tracteurs & Co ne voit jamais ses coordonnées bancaires.',
          'Frais. La publication d’annonces est gratuite et aucune commission n’est prélevée sur le vendeur. L’acheteur qui utilise le paiement sécurisé paie des frais de service de 0,70 € plus 4 % du prix, plafonnés à 40 €, affichés avant le paiement. Les frais de port éventuels sont fixés par le vendeur et lui sont reversés avec le prix.',
          'Déroulement. Une fois le paiement reçu, l’annonce passe « réservée » et l’argent est conservé par Tracteurs & Co pour le compte du vendeur. En main propre, l’acheteur reçoit un code à 6 chiffres qu’il donne au vendeur à la remise du bien : la saisie de ce code vaut acceptation du bien et déclenche le versement au vendeur ; l’acheteur ne doit donc le donner qu’après avoir vérifié le bien. Sans remise dans les 21 jours suivant le paiement, la vente est annulée et l’acheteur remboursé. Pour un envoi, le vendeur expédie le bien avec un numéro de suivi ; il est payé lorsque l’acheteur confirme la réception, ou automatiquement 10 jours après l’expédition si l’acheteur n’a signalé aucun problème.',
          'Annulation et litiges. Tant que le bien n’est ni remis ni expédié, le vendeur peut annuler la vente. En cas de problème (bien non conforme à l’annonce, colis perdu ou abîmé, vendeur injoignable), l’acheteur le signale depuis sa transaction avant le versement : l’argent est alors bloqué et l’équipe examine la vente avec les deux parties, puis décide de rembourser l’acheteur ou de payer le vendeur. Tout remboursement est intégral, frais de service et de port compris. Entre particuliers, la vente reste régie par le droit commun (notamment la garantie des vices cachés) ; un vendeur professionnel doit en outre ses garanties légales.',
          'Conformément à la loi, les plateformes de vente doivent déclarer chaque année à l’administration fiscale les vendeurs ayant réalisé au moins 30 ventes ou 2 000 € de ventes dans l’année par l’intermédiaire du paiement du site.',
        ],
      },
      {
        h: '9. Litiges',
        p: [
          'Ces conditions sont soumises au droit français. En cas de difficulté, écrivez-nous d’abord à ' + CONTACT + ' : nous chercherons une solution amiable. À défaut, le litige sera porté devant les tribunaux compétents.',
        ],
      },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(pages).map((legal) => ({ legal }));
}

export const dynamicParams = false;

export async function generateMetadata(props: PageProps<'/[legal]'>): Promise<Metadata> {
  const { legal } = await props.params;
  return { title: pages[legal]?.title ?? 'Page introuvable' };
}

export default async function LegalPage(props: PageProps<'/[legal]'>) {
  const { legal } = await props.params;
  const page = pages[legal];
  if (!page) notFound();
  return (
    <article className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="mb-4 text-4xl font-bold tracking-tight">{page.title}</h1>
      {page.intro ? <p className="mb-8 text-muted">{page.intro}</p> : <div className="mb-4" />}
      {page.sections.map((s) => (
        <section key={s.h} id={s.id} className="mb-8 scroll-mt-24">
          <h2 className="mb-3 text-xl font-semibold">{s.h}</h2>
          {s.p.map((p) => <p key={p} className="mb-3 leading-relaxed text-muted">{p}</p>)}
        </section>
      ))}
      {legal === 'mentions-legales' ? (
        <section className="mt-10 border-t border-line pt-8">
          <h2 className="mb-3 text-xl font-semibold">Crédits photos</h2>
          <p className="mb-3 text-muted">
            Photos de la page d’accueil sous <a href="https://unsplash.com/license" className="text-brand underline" rel="noopener noreferrer">licence Unsplash</a>. Photos des fiches techniques : auteur et licence indiqués sous chaque photo.
          </p>
          <ul className="flex flex-col gap-1.5 text-sm text-muted">
            {PHOTO_CREDITS.map((c) => (
              <li key={c.file}>
                {c.subject} : <a href={c.url} className="text-brand underline" rel="noopener noreferrer">{c.author}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
