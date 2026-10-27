/** Formulaire de contact : sujets et statuts (partagés entre le site et l'admin). */

export const CONTACT_TOPICS = {
  question: 'Question sur le service',
  abonnement: 'Abonnement et facturation',
  fiche: 'Fiche technique (erreur, demande de modèle)',
  compte: 'Mon compte',
  partenariat: 'Partenariat, CUMA, concession',
  autre: 'Autre',
} as const;
export type ContactTopic = keyof typeof CONTACT_TOPICS;

export const CONTACT_STATUSES = {
  nouveau: 'Nouveau',
  en_cours: 'En cours',
  traite: 'Traité',
  archive: 'Archivé',
} as const;
export type ContactStatus = keyof typeof CONTACT_STATUSES;

export type ContactReply = { at: string; by: string; subject: string; body: string };

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  phone: string;
  farm_name: string;
  topic: ContactTopic;
  message: string;
  user_id: string | null;
  status: ContactStatus;
  admin_note: string;
  replies: ContactReply[];
  created_at: string;
  updated_at: string;
  handled_at: string | null;
};
