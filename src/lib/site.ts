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
    siret: '944 979 103 00024',
    address: '29 avenue du 8 Mai 1945, 34740 Vendargues',
    /** À renseigner : obligatoire dans les mentions légales d'un entrepreneur individuel. */
    phone: '',
  },
  /** Micro-entreprise en franchise en base de TVA. */
  vatMention: 'TVA non applicable, art. 293 B du CGI',
} as const;
