import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PHOTO_CREDITS } from '@/lib/photo-credits';
import { SITE } from '@/lib/site';
import { ANNUAL_DISCOUNT, COMPLET_PRICES, FREE_MACHINE_LIMIT, TRIAL_DAYS } from '@/lib/plans';

/**
 * Pages légales. Base rédigée pour une micro-entreprise : à faire relire par
 * un professionnel (juriste, expert-comptable) avant l'ouverture au public.
 * Les éléments entre crochets viennent de src/lib/site.ts.
 */

type Section = { h: string; p: string[] };
type LegalPage = { title: string; intro?: string; sections: Section[] };

const E = SITE.editor;
const UPDATED = '25 octobre 2026';
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
          'Votre parc matériel : machines, relevés de compteur, entretiens, dépenses et réglages que vous saisissez.',
          'L’abonnement : historique des paiements et factures. Les numéros de carte bancaire sont traités par Stripe et ne passent jamais par Tracteurs & Co.',
          'La sécurité : journal technique des connexions et actions sensibles (adresse IP comprise), pour détecter les abus.',
        ],
      },
      {
        h: 'Pourquoi ces données',
        p: [
          'Fournir le service (carnet d’entretien, rappels, coût de revient, rapports) : exécution du contrat.',
          'Facturer l’abonnement et tenir la comptabilité : obligation légale.',
          'Sécuriser les comptes et le site : intérêt légitime.',
          'Vous envoyer quelques nouveautés et conseils : intérêt légitime, désactivable à tout moment.',
          'Vos données ne sont jamais vendues ni utilisées pour de la publicité.',
        ],
      },
      {
        h: 'Prestataires',
        p: [
          'Vercel (hébergement du site, États-Unis), Supabase (base de données, Paris), Resend (envoi des e-mails, serveurs en Irlande), Stripe (paiements, Irlande).',
          'Anthropic (États-Unis) : l’aide au diagnostic transmet à l’intelligence artificielle Claude la description de panne que vous saisissez. N’y indiquez pas d’informations personnelles.',
          'Les transferts hors de l’Union européenne sont encadrés par les garanties prévues par le RGPD (clauses contractuelles types ou cadre de protection des données UE–États-Unis).',
        ],
      },
      {
        h: 'Durée de conservation',
        p: [
          'Vos données sont conservées tant que votre compte est actif et supprimées lorsque vous supprimez votre compte, sauf les factures, conservées 10 ans (obligation comptable).',
        ],
      },
      {
        h: 'E-mails',
        p: [
          'Les e-mails de compte (confirmation, mot de passe) sont toujours envoyés. Les rappels d’entretien et les nouveautés se désactivent à tout moment : lien « Gérer mes e-mails » en bas de chaque message, ou rubrique « Mon compte ».',
        ],
      },
      {
        h: 'Cookies',
        p: [
          'Le site n’utilise que des cookies indispensables (maintien de votre connexion) et mémorise votre choix de thème clair ou sombre sur votre appareil. Aucun cookie publicitaire ni de mesure d’audience : aucun consentement n’est donc demandé.',
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
          `Un premier abonnement commence par ${TRIAL_DAYS} jours d’essai gratuit. Sans résiliation pendant l’essai, l’abonnement démarre à la fin de celui-ci.`,
          'Le paiement se fait par carte via Stripe, au début de chaque période. L’abonnement se renouvelle automatiquement pour la même durée.',
          'Toute évolution de prix vous est annoncée par e-mail au moins 30 jours avant de s’appliquer, et vous pouvez résilier avant.',
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
        h: '7. Litiges',
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
        <section key={s.h} className="mb-8">
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
