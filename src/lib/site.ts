/**
 * Informations publiques du site (contact, éditeur). Les éléments entre
 * crochets sont à compléter avant l'ouverture au public.
 */
export const SITE = {
  name: 'Tracteurs & Co',
  domain: 'tracteursandco.fr',
  contactEmail: 'contact@tracteursandco.fr',
  editor: {
    name: 'Théo Sarrat',
    status: 'Entrepreneur individuel (micro-entreprise)',
    siret: '[SIRET]',
    address: '[adresse postale]',
    phone: '[téléphone]',
  },
  /** Micro-entreprise en franchise en base de TVA. */
  vatMention: 'TVA non applicable, art. 293 B du CGI',
} as const;
