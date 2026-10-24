import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

// Pages légales : textes à compléter avec un professionnel avant la mise en ligne.
const pages: Record<string, { title: string; body: string[] }> = {
  'mentions-legales': {
    title: 'Mentions légales',
    body: [
      'Éditeur : [Raison sociale], [forme juridique], au capital de [montant], immatriculée au RCS de [ville] sous le numéro [SIREN].',
      'Siège : [adresse]. Directeur de la publication : [nom]. Contact : [e-mail].',
      'Hébergement : [hébergeur du site] et Supabase (base de données, région Union européenne).',
    ],
  },
  confidentialite: {
    title: 'Politique de confidentialité',
    body: [
      '[À rédiger avec un conseil RGPD.] Données collectées : compte (nom, e-mail), données de l’exploitation (parcelles, interventions, matériel), facturation via Stripe.',
      'Finalités : fourniture du service, facturation, sécurité. Les numéros de carte bancaire ne sont jamais stockés par Sillon.',
      'Vos droits : accès, rectification, export et suppression de vos données sur simple demande à [e-mail].',
    ],
  },
  conditions: {
    title: 'Conditions d’utilisation',
    body: ['[À rédiger avant la mise en ligne : objet du service, formules et paiement, résiliation, responsabilité (notamment : les fiches techniques ne remplacent pas le manuel du constructeur), droit applicable.]'],
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
      <h1 className="mb-8 text-4xl font-bold tracking-tight">{page.title}</h1>
      {page.body.map((p) => <p key={p} className="mb-4 leading-relaxed text-muted">{p}</p>)}
    </article>
  );
}
