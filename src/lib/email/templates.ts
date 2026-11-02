import { renderMarkdown } from '@/lib/markdown';
import { markdownToEmailHtml, markdownToText, renderEmail, type DueRow, type EmailContent } from '@/lib/email/layout';

/**
 * Tous les modèles d'e-mails de Tracteurs & Co, en français.
 * Fonctions pures : elles servent à l'envoi comme à l'aperçu dans l'admin.
 */

export type BuiltEmail = { subject: string; html: string; text: string };

const build = (subject: string, content: EmailContent, siteUrl: string): BuiltEmail => ({ subject, ...renderEmail(content, { siteUrl }) });

const hello = (name?: string | null) => (name?.trim() ? `Bonjour ${name.trim().split(/\s+/)[0]},` : 'Bonjour,');

// ---------------------------------------------------------------------
// E-mails de compte (envoyés à la demande de Supabase Auth)
// ---------------------------------------------------------------------

export const AUTH_TEMPLATES = [
  'signup',
  'recovery',
  'magiclink',
  'invite',
  'email_change_current',
  'email_change_new',
  'reauthentication',
  'password_changed_notification',
  'email_changed_notification',
  'mfa_factor_enrolled_notification',
  'mfa_factor_unenrolled_notification',
  'identity_linked_notification',
  'identity_unlinked_notification',
  'phone_changed_notification',
] as const;
export type AuthTemplate = (typeof AUTH_TEMPLATES)[number];

export const AUTH_TEMPLATE_LABELS: Record<AuthTemplate, string> = {
  signup: 'Confirmation d’inscription',
  recovery: 'Mot de passe oublié',
  magiclink: 'Lien de connexion',
  invite: 'Invitation',
  email_change_current: 'Changement d’e-mail (ancienne adresse)',
  email_change_new: 'Changement d’e-mail (nouvelle adresse)',
  reauthentication: 'Code de vérification',
  password_changed_notification: 'Alerte : mot de passe modifié',
  email_changed_notification: 'Alerte : e-mail modifié',
  mfa_factor_enrolled_notification: 'Alerte : double authentification activée',
  mfa_factor_unenrolled_notification: 'Alerte : double authentification retirée',
  identity_linked_notification: 'Alerte : mode de connexion ajouté',
  identity_unlinked_notification: 'Alerte : mode de connexion retiré',
  phone_changed_notification: 'Alerte : téléphone modifié',
};

export type AuthEmailInput = {
  name?: string | null;
  /** Lien de confirmation (déjà construit). */
  url?: string;
  /** Code à 6 chiffres (réauthentification). */
  code?: string;
  /** Adresse concernée (changement d'e-mail). */
  newEmail?: string;
  oldEmail?: string;
};

const NOT_YOU = 'Vous n’êtes pas à l’origine de cette demande ? Ignorez simplement cet e-mail : rien ne changera sur votre compte.';
const SECURITY_REASON = 'Vous recevez cet e-mail de sécurité parce qu’il concerne votre compte Tracteurs & Co.';

export function authEmail(template: AuthTemplate, input: AuthEmailInput, siteUrl: string): BuiltEmail {
  const site = siteUrl.replace(/\/$/, '');
  const url = input.url ?? site;
  const resetUrl = `${site}/mot-de-passe-oublie`;
  const alert = (subject: string, heading: string, what: string): BuiltEmail =>
    build(
      subject,
      {
        preheader: what,
        heading,
        blocks: [
          { type: 'p', text: hello(input.name) },
          { type: 'p', text: what },
          { type: 'note', tone: 'danger', text: '**Ce n’est pas vous ?** Changez tout de suite votre mot de passe et vérifiez la double authentification de votre compte.' },
          { type: 'button', label: 'Sécuriser mon compte', url: resetUrl },
        ],
        reason: SECURITY_REASON,
      },
      site,
    );

  switch (template) {
    case 'signup':
      return build(
        'Confirmez votre adresse e-mail',
        {
          preheader: 'Une dernière étape pour accéder à votre parc matériel.',
          heading: 'Bienvenue sur Tracteurs & Co',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: 'Merci pour votre inscription. Il ne reste qu’une étape : confirmez votre adresse e-mail pour ouvrir votre carnet d’entretien et ajouter vos premières machines.' },
            { type: 'button', label: 'Confirmer mon adresse', url },
            { type: 'p', text: 'Ensuite, en quelques minutes : ajoutez vos tracteurs et outils, notez le compteur, et Tracteurs & Co vous prévient avant chaque vidange ou entretien.' },
            { type: 'note', text: 'Ce lien ne sert qu’une fois et expire au bout d’une heure. ' + NOT_YOU },
            { type: 'fallback', url },
          ],
          reason: 'Vous recevez cet e-mail parce que cette adresse vient d’être utilisée pour créer un compte Tracteurs & Co.',
        },
        site,
      );
    case 'recovery':
      return build(
        'Réinitialisez votre mot de passe',
        {
          preheader: 'Choisissez un nouveau mot de passe en un clic.',
          heading: 'Nouveau mot de passe',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: 'Vous avez demandé à changer le mot de passe de votre compte. Ce bouton vous connecte et vous amène directement au choix du nouveau mot de passe.' },
            { type: 'button', label: 'Choisir un nouveau mot de passe', url },
            { type: 'note', text: 'Ce lien ne sert qu’une fois et expire au bout d’une heure. ' + NOT_YOU },
            { type: 'fallback', url },
          ],
          reason: SECURITY_REASON,
        },
        site,
      );
    case 'magiclink':
      return build(
        'Votre lien de connexion',
        {
          preheader: 'Connectez-vous à Tracteurs & Co en un clic.',
          heading: 'Votre lien de connexion',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: 'Voici le lien pour vous connecter à votre compte, sans mot de passe.' },
            { type: 'button', label: 'Me connecter', url },
            { type: 'note', text: 'Ce lien ne sert qu’une fois et expire au bout d’une heure. ' + NOT_YOU },
            { type: 'fallback', url },
          ],
          reason: SECURITY_REASON,
        },
        site,
      );
    case 'invite':
      return build(
        'Vous êtes invité sur Tracteurs & Co',
        {
          preheader: 'Un compte vous attend pour suivre le matériel.',
          heading: 'Vous êtes invité',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: 'Un compte Tracteurs & Co a été créé pour vous. Acceptez l’invitation, puis choisissez votre mot de passe.' },
            { type: 'button', label: 'Accepter l’invitation', url },
            { type: 'fallback', url },
          ],
          reason: 'Vous recevez cet e-mail parce qu’un administrateur de Tracteurs & Co vous a invité.',
        },
        site,
      );
    case 'email_change_current':
      return build(
        'Confirmez le changement d’adresse e-mail',
        {
          preheader: 'Une demande de changement d’adresse a été faite sur votre compte.',
          heading: 'Changement d’adresse e-mail',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: `Vous avez demandé à remplacer cette adresse par **${input.newEmail ?? 'une nouvelle adresse'}**. Confirmez depuis cette adresse-ci pour valider le changement.` },
            { type: 'button', label: 'Confirmer le changement', url },
            { type: 'note', tone: 'danger', text: '**Ce n’est pas vous ?** Ne cliquez pas, et changez votre mot de passe : quelqu’un a peut-être accès à votre compte.' },
            { type: 'fallback', url },
          ],
          reason: SECURITY_REASON,
        },
        site,
      );
    case 'email_change_new':
      return build(
        'Confirmez votre nouvelle adresse e-mail',
        {
          preheader: 'Validez cette adresse pour votre compte Tracteurs & Co.',
          heading: 'Confirmez votre nouvelle adresse',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: 'Cette adresse va devenir celle de votre compte Tracteurs & Co. Confirmez-la pour terminer le changement.' },
            { type: 'button', label: 'Confirmer cette adresse', url },
            { type: 'note', text: NOT_YOU },
            { type: 'fallback', url },
          ],
          reason: 'Vous recevez cet e-mail parce que cette adresse a été indiquée comme nouvelle adresse d’un compte Tracteurs & Co.',
        },
        site,
      );
    case 'reauthentication':
      return build(
        `${input.code ?? '000000'} : votre code de vérification`,
        {
          preheader: 'Votre code de vérification Tracteurs & Co.',
          heading: 'Votre code de vérification',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: 'Pour confirmer cette action sensible, saisissez ce code :' },
            { type: 'code', value: input.code ?? '000000' },
            { type: 'note', text: 'Ce code expire rapidement. Ne le communiquez à personne : Tracteurs & Co ne vous le demandera jamais par téléphone.' },
          ],
          reason: SECURITY_REASON,
        },
        site,
      );
    case 'password_changed_notification':
      return alert('Votre mot de passe a été modifié', 'Mot de passe modifié', 'Le mot de passe de votre compte Tracteurs & Co vient d’être modifié.');
    case 'email_changed_notification':
      return alert(
        'Votre adresse e-mail a été modifiée',
        'Adresse e-mail modifiée',
        `L’adresse de votre compte Tracteurs & Co a été remplacée${input.newEmail ? ` par ${input.newEmail}` : ''}.`,
      );
    case 'mfa_factor_enrolled_notification':
      return alert(
        'Double authentification activée',
        'Double authentification activée',
        'Un code de vérification par application est désormais demandé à la connexion sur votre compte. C’est une très bonne protection.',
      );
    case 'mfa_factor_unenrolled_notification':
      return alert('Double authentification retirée', 'Double authentification retirée', 'La double authentification vient d’être retirée de votre compte Tracteurs & Co.');
    case 'identity_linked_notification':
      return alert('Nouveau mode de connexion', 'Nouveau mode de connexion', 'Un nouveau mode de connexion vient d’être ajouté à votre compte Tracteurs & Co.');
    case 'identity_unlinked_notification':
      return alert('Mode de connexion retiré', 'Mode de connexion retiré', 'Un mode de connexion vient d’être retiré de votre compte Tracteurs & Co.');
    case 'phone_changed_notification':
      return alert('Numéro de téléphone modifié', 'Téléphone modifié', 'Le numéro de téléphone de votre compte Tracteurs & Co vient d’être modifié.');
  }
}

// ---------------------------------------------------------------------
// Rappels d'entretien
// ---------------------------------------------------------------------

export function reminderEmail(
  input: { name?: string | null; rows: DueRow[]; preferencesUrl: string },
  siteUrl: string,
): BuiltEmail {
  const site = siteUrl.replace(/\/$/, '');
  const late = input.rows.filter((r) => r.level === 'retard').length;
  const soon = input.rows.length - late;
  const first = input.rows[0];
  const subject =
    input.rows.length === 1
      ? `${first.level === 'retard' ? 'En retard' : 'Bientôt'} : ${first.operation} · ${first.machine}`
      : late
        ? `${late} entretien${late > 1 ? 's' : ''} en retard${soon ? `, ${soon} à prévoir` : ''}`
        : `${soon} entretiens à prévoir`;
  const summary = [late ? `${late} en retard` : '', soon ? `${soon} à prévoir bientôt` : ''].filter(Boolean).join(' et ');

  return build(
    subject,
    {
      preheader: `${summary} sur votre parc matériel.`,
      heading: late ? 'Des entretiens vous attendent' : 'Entretiens à prévoir',
      blocks: [
        { type: 'p', text: hello(input.name) },
        { type: 'p', text: `Voici le point sur votre parc : **${summary}**. Chaque échéance tombe au premier terme atteint, heures moteur ou mois.` },
        { type: 'due', rows: input.rows },
        { type: 'button', label: 'Ouvrir mon parc matériel', url: `${site}/app/materiel` },
        { type: 'note', text: 'Entretien déjà fait ? Notez-le sur la fiche de la machine : le rappel disparaît et la prochaine échéance se recalcule. Pensez aussi à mettre le compteur à jour.' },
      ],
      reason: 'Vous recevez ce rappel parce que les rappels d’entretien sont activés sur votre compte Tracteurs & Co.',
      preferencesUrl: input.preferencesUrl,
    },
    site,
  );
}

// ---------------------------------------------------------------------
// Annonces envoyées depuis l'admin
// ---------------------------------------------------------------------

export function campaignEmail(
  input: { subject: string; bodyMd: string; name?: string | null; preferencesUrl?: string },
  siteUrl: string,
): BuiltEmail {
  const site = siteUrl.replace(/\/$/, '');
  const body = markdownToText(input.bodyMd);
  return build(
    input.subject,
    {
      preheader: body.split('\n').find((l) => l.trim())?.slice(0, 140) ?? input.subject,
      heading: input.subject,
      blocks: [
        { type: 'p', text: hello(input.name) },
        { type: 'html', html: markdownToEmailHtml(renderMarkdown(input.bodyMd), site), text: body },
        { type: 'p', text: 'À bientôt,\n**L’équipe Tracteurs & Co**' },
      ],
      reason: 'Vous recevez cet e-mail en tant que membre de Tracteurs & Co.',
      preferencesUrl: input.preferencesUrl,
    },
    site,
  );
}

/** Message personnel écrit par un admin depuis la fiche d'un membre (ou plusieurs). */
export function messageEmail(input: { subject: string; bodyMd: string; name?: string | null }, siteUrl: string): BuiltEmail {
  const site = siteUrl.replace(/\/$/, '');
  const body = markdownToText(input.bodyMd);
  return build(
    input.subject,
    {
      preheader: body.split('\n').find((l) => l.trim())?.slice(0, 140) ?? input.subject,
      heading: input.subject,
      blocks: [
        { type: 'p', text: hello(input.name) },
        { type: 'html', html: markdownToEmailHtml(renderMarkdown(input.bodyMd), site), text: body },
        { type: 'p', text: 'Bien cordialement,\n**L’équipe Tracteurs & Co**' },
        { type: 'note', text: 'Pour nous répondre, répondez simplement à cet e-mail.' },
      ],
      reason: 'Vous recevez ce message personnel de l’équipe Tracteurs & Co au sujet de votre compte.',
    },
    site,
  );
}

// ---------------------------------------------------------------------
// Formulaire de contact
// ---------------------------------------------------------------------


/** Accusé de réception envoyé à la personne qui écrit. */
export function contactAckEmail(input: { name: string; topic: string; message: string }, siteUrl: string): BuiltEmail {
  return build(
    'Nous avons bien reçu votre message',
    {
      preheader: 'Nous vous répondons sous 2 jours ouvrés.',
      heading: 'Message bien reçu',
      blocks: [
        { type: 'p', text: hello(input.name) },
        { type: 'p', text: `Merci pour votre message (**${input.topic}**). Nous vous répondons en général **sous 2 jours ouvrés**, à cette adresse.` },
        { type: 'note', text: `Votre message :\n${input.message.slice(0, 1500)}` },
        { type: 'p', text: 'À bientôt,\n**L’équipe Tracteurs & Co**' },
      ],
      reason: 'Vous recevez cet e-mail parce que vous nous avez écrit depuis le formulaire de contact de Tracteurs & Co.',
    },
    siteUrl,
  );
}

/** Alerte aux admins : nouveau message (la réponse directe va à l'expéditeur). */
export function contactAlertEmail(input: { name: string; email: string; topic: string; message: string; url: string; member: boolean }, siteUrl: string): BuiltEmail {
  return build(
    `[Contact] ${input.topic} — ${input.name}`,
    {
      preheader: input.message.slice(0, 140),
      heading: 'Nouveau message de contact',
      blocks: [
        { type: 'p', text: `**${input.name}** (${input.email})${input.member ? ', membre du site' : ''} a écrit au sujet de : **${input.topic}**.` },
        { type: 'note', text: input.message.slice(0, 3000) },
        { type: 'button', label: 'Ouvrir dans l’admin', url: input.url },
        { type: 'p', text: 'Vous pouvez aussi répondre directement à cet e-mail : la réponse partira vers l’expéditeur.' },
      ],
      reason: 'Alerte envoyée aux administrateurs de Tracteurs & Co à chaque nouveau message de contact.',
    },
    siteUrl,
  );
}

/** Réponse de l'équipe, écrite dans l'admin (le message d'origine est rappelé). */
export function contactReplyEmail(input: { name: string; subject: string; bodyMd: string; original: string }, siteUrl: string): BuiltEmail {
  const site = siteUrl.replace(/\/$/, '');
  const body = markdownToText(input.bodyMd);
  return build(
    input.subject,
    {
      preheader: body.split('\n').find((l) => l.trim())?.slice(0, 140) ?? input.subject,
      heading: input.subject,
      blocks: [
        { type: 'p', text: hello(input.name) },
        { type: 'html', html: markdownToEmailHtml(renderMarkdown(input.bodyMd), site), text: body },
        { type: 'p', text: 'Bien cordialement,\n**L’équipe Tracteurs & Co**' },
        { type: 'note', text: `Votre message :\n${input.original.slice(0, 1500)}` },
      ],
      reason: 'Vous recevez cette réponse à votre message envoyé depuis le formulaire de contact de Tracteurs & Co. Répondez simplement à cet e-mail pour poursuivre l’échange.',
    },
    site,
  );
}

// ---------------------------------------------------------------------
// Abonnement et facturation (déclenchés par le webhook Stripe)
// ---------------------------------------------------------------------

export const BILLING_TEMPLATES = ['abonnement_active', 'essai_fin_proche', 'paiement_recu', 'paiement_refuse', 'resiliation_programmee', 'abonnement_termine', 'remboursement', 'parrainage'] as const;
export type BillingTemplate = (typeof BILLING_TEMPLATES)[number];

export const BILLING_TEMPLATE_LABELS: Record<BillingTemplate, string> = {
  abonnement_active: 'Abonnement activé',
  essai_fin_proche: 'Fin d’essai dans 3 jours',
  paiement_recu: 'Paiement reçu',
  paiement_refuse: 'Paiement refusé',
  resiliation_programmee: 'Résiliation confirmée',
  abonnement_termine: 'Abonnement terminé',
  remboursement: 'Remboursement (avoir)',
  parrainage: 'Parrainage : mois offert',
};

export type BillingEmailInput = {
  name?: string | null;
  /** « 6,99 € par mois » */
  priceLabel?: string;
  /** Date lisible : fin d'essai, prochaine échéance ou fin d'accès. */
  date?: string;
  /** Montant payé, ex. « 6,99 € ». */
  amount?: string;
  invoiceUrl?: string | null;
  /** Numéro de la facture ou de l'avoir Tracteurs & Co (PDF joint à l'e-mail). */
  invoiceNumber?: string;
  trial?: boolean;
  /** Échéance offerte par un code à 100 % : facture à 0 €, rien n'est débité. */
  offered?: boolean;
};

const BILLING_REASON = 'Vous recevez cet e-mail parce qu’il concerne votre abonnement Tracteurs & Co.';

export function billingEmail(template: BillingTemplate, input: BillingEmailInput, siteUrl: string): BuiltEmail {
  const site = siteUrl.replace(/\/$/, '');
  const account = `${site}/app/abonnement`;
  const price = input.priceLabel ?? 'le prix de votre formule';
  switch (template) {
    case 'abonnement_active':
      return build(
        input.trial ? 'Votre essai de la formule Complet a commencé' : 'Votre formule Complet est activée',
        {
          preheader: input.trial ? `30 jours offerts, jusqu’au ${input.date}.` : 'Toutes les fonctions sont débloquées.',
          heading: 'Bienvenue dans la formule Complet',
          blocks: [
            { type: 'p', text: hello(input.name) },
            {
              type: 'p',
              text: input.trial
                ? `Merci ! Votre essai gratuit est ouvert **jusqu’au ${input.date}**. Ensuite, l’abonnement continue à **${price}**, sauf si vous le résiliez avant : un e-mail vous le rappellera 3 jours avant.`
                : `Merci ! Votre abonnement est actif à **${price}**.${input.date ? ` Prochaine échéance : ${input.date}.` : ''}`,
            },
            { type: 'p', text: 'Ce qui est maintenant débloqué : parc matériel illimité, coût de revient à l’heure de chaque machine, rapport d’historique pour la revente et aide au diagnostic des pannes.' },
            { type: 'button', label: 'Ouvrir mon parc matériel', url: `${site}/app/materiel` },
            { type: 'note', text: 'Vous pouvez changer de carte, passer à l’annuel ou résilier à tout moment depuis la page « Abonnement » de votre compte.' },
          ],
          reason: BILLING_REASON,
        },
        site,
      );
    case 'essai_fin_proche':
      return build(
        `Votre essai se termine le ${input.date}`,
        {
          preheader: `Ensuite : ${price}. Rien à faire pour continuer.`,
          heading: 'Votre essai se termine bientôt',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: `Votre essai gratuit de la formule Complet se termine le **${input.date}**. Le premier paiement de **${price}** aura lieu ce jour-là, avec la carte enregistrée.` },
            { type: 'p', text: 'Pour continuer, vous n’avez rien à faire. Pour arrêter, résiliez avant cette date depuis votre compte : vous ne serez pas débité et vous repasserez en formule Gratuit.' },
            { type: 'button', label: 'Gérer mon abonnement', url: account },
          ],
          reason: BILLING_REASON,
        },
        site,
      );
    case 'parrainage':
      return build(
        `Merci ! ${input.amount ?? 'Un mois'} offert sur votre abonnement`,
        {
          preheader: 'Une personne que vous avez parrainée vient de s’abonner.',
          heading: 'Votre parrainage a fonctionné',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: `Une personne que vous avez invitée vient de régler son premier paiement sur Tracteurs & Co. Pour vous remercier, **${input.amount ?? 'un mois d’abonnement'}** est crédité sur votre compte.` },
            { type: 'p', text: 'Ce crédit est déduit automatiquement de votre prochain paiement de la formule Complet : vous n’avez rien à faire. Il apparaîtra sur la facture correspondante.' },
            { type: 'button', label: 'Voir mon parrainage', url: `${site}/app/abonnement#parrainage` },
            { type: 'note', text: 'Pas de limite : chaque nouvelle personne abonnée grâce à votre lien vous rapporte un mois.' },
          ],
          reason: BILLING_REASON,
        },
        site,
      );
    case 'paiement_recu':
      if (input.offered)
        return build(
          input.invoiceNumber ? `Votre facture n° ${input.invoiceNumber}` : 'Votre facture Tracteurs & Co',
          {
            preheader: 'Rien n’a été débité pour cette échéance.',
            heading: 'Votre facture',
            blocks: [
              { type: 'p', text: hello(input.name) },
              { type: 'p', text: `Cette échéance de votre formule Complet est entièrement couverte par votre remise ou votre crédit de parrainage : son montant est de **0,00 €**, rien n’a été débité.${input.date ? ` Prochaine échéance : ${input.date}.` : ''}` },
              ...(input.invoiceNumber ? [{ type: 'p' as const, text: `Votre facture **n° ${input.invoiceNumber}** est jointe à cet e-mail, au format PDF.` }] : []),
              ...(input.invoiceUrl ? [{ type: 'button' as const, label: 'Télécharger la facture', url: input.invoiceUrl }] : []),
              { type: 'note', text: 'Toutes vos factures restent disponibles à tout moment dans la page « Abonnement » de votre compte.' },
            ],
            reason: BILLING_REASON,
          },
          site,
        );
      return build(
        `Paiement reçu : ${input.amount}`,
        {
          preheader: 'Merci, votre abonnement Tracteurs & Co continue.',
          heading: 'Paiement reçu, merci',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: `Nous avons bien reçu votre paiement de **${input.amount}** pour la formule Complet.${input.date ? ` Prochaine échéance : ${input.date}.` : ''}` },
            ...(input.invoiceNumber ? [{ type: 'p' as const, text: `Votre facture **n° ${input.invoiceNumber}** est jointe à cet e-mail, au format PDF.` }] : []),
            ...(input.invoiceUrl ? [{ type: 'button' as const, label: 'Télécharger la facture', url: input.invoiceUrl }] : []),
            { type: 'note', text: 'Toutes vos factures restent disponibles à tout moment dans la page « Abonnement » de votre compte.' },
          ],
          reason: BILLING_REASON,
        },
        site,
      );
    case 'paiement_refuse':
      return build(
        'Paiement refusé : mettez à jour votre carte',
        {
          preheader: 'Votre accès à la formule Complet est maintenu quelques jours.',
          heading: 'Votre paiement n’est pas passé',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: `Le paiement de **${input.amount ?? price}** pour votre formule Complet a été refusé par votre banque (carte expirée, plafond atteint…).` },
            { type: 'p', text: 'Votre accès est maintenu pendant que nous réessayons automatiquement dans les prochains jours. Pour régler le problème tout de suite, mettez à jour votre carte :' },
            { type: 'button', label: 'Mettre à jour ma carte', url: account },
            { type: 'note', text: 'Sans paiement après plusieurs tentatives, votre compte repassera en formule Gratuit : vos données sont conservées, rien n’est supprimé.' },
          ],
          reason: BILLING_REASON,
        },
        site,
      );
    case 'resiliation_programmee':
      return build(
        'Résiliation confirmée',
        {
          preheader: `Accès à la formule Complet jusqu’au ${input.date}.`,
          heading: 'Votre résiliation est enregistrée',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: `C’est noté : votre formule Complet s’arrêtera le **${input.date}**, sans nouveau prélèvement. D’ici là, vous gardez toutes les fonctions.` },
            { type: 'p', text: 'Ensuite, votre compte repassera en formule Gratuit : vos machines, entretiens et dépenses sont conservés.' },
            { type: 'button', label: 'J’ai changé d’avis', url: account },
          ],
          reason: BILLING_REASON,
        },
        site,
      );
    case 'remboursement':
      return build(
        `Remboursement de ${input.amount}`,
        {
          preheader: 'Votre avoir Tracteurs & Co est joint à cet e-mail.',
          heading: 'Votre remboursement est en route',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: `Nous vous avons remboursé **${input.amount}** sur votre moyen de paiement d’origine. Selon votre banque, l’argent apparaît sur votre compte sous 5 à 10 jours.` },
            ...(input.invoiceNumber ? [{ type: 'p' as const, text: `L’avoir correspondant, **n° ${input.invoiceNumber}**, est joint à cet e-mail au format PDF.` }] : []),
            ...(input.invoiceUrl ? [{ type: 'button' as const, label: 'Télécharger l’avoir', url: input.invoiceUrl }] : []),
            { type: 'note', text: 'Une question sur ce remboursement ? Répondez simplement à cet e-mail.' },
          ],
          reason: BILLING_REASON,
        },
        site,
      );
    case 'abonnement_termine':
      return build(
        'Votre formule Complet est terminée',
        {
          preheader: 'Votre compte est repassé en formule Gratuit. Vos données sont conservées.',
          heading: 'Votre abonnement est terminé',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: 'Votre formule Complet est terminée et votre compte est repassé en formule Gratuit. Toutes vos données sont conservées.' },
            { type: 'p', text: 'Vous pouvez reprendre la formule Complet à tout moment, en un clic, depuis votre compte.' },
            { type: 'button', label: 'Reprendre la formule Complet', url: account },
            { type: 'note', text: 'Une remarque sur ce qui vous a manqué ? Répondez simplement à cet e-mail : c’est lu.' },
          ],
          reason: BILLING_REASON,
        },
        site,
      );
  }
}

// ---------------------------------------------------------------------
// Fiches demandées et relances des comptes gratuits
// ---------------------------------------------------------------------

/** La fiche qu'un membre avait demandée est en ligne. */
export function sheetReadyEmail(input: { name?: string | null; title: string; url: string }, siteUrl: string): BuiltEmail {
  const site = siteUrl.replace(/\/$/, '');
  return build(
    `Votre fiche ${input.title} est en ligne`,
    {
      preheader: 'La fiche technique que vous avez demandée est disponible.',
      heading: 'Votre fiche est prête',
      blocks: [
        { type: 'p', text: hello(input.name) },
        { type: 'p', text: `Vous nous aviez demandé la fiche technique du **${input.title}** : elle est en ligne, relue par l’équipe. Caractéristiques, entretien, pannes fréquentes et pièces.` },
        { type: 'button', label: 'Ouvrir la fiche', url: input.url },
        { type: 'note', text: 'Vous avez ce tracteur ? Ajoutez-le à votre parc depuis la fiche : vous recevrez les rappels d’entretien au bon moment.' },
      ],
      reason: 'Vous recevez cet e-mail parce que vous avez demandé cette fiche sur Tracteurs & Co.',
    },
    site,
  );
}

export type NudgeKind = 'limite_machines' | 'inactif';

/** Relances des comptes gratuits (une seule fois chacune, désinscription possible). */
export function nudgeEmail(
  kind: NudgeKind,
  input: { name?: string | null; machines: number; limit: number; priceLabel: string; trialDays: number; preferencesUrl: string },
  siteUrl: string,
): BuiltEmail {
  const site = siteUrl.replace(/\/$/, '');
  if (kind === 'limite_machines') {
    return build(
      `Vos ${input.limit} machines sont suivies : et la suite ?`,
      {
        preheader: `Passez à la formule Complet pour suivre tout votre parc. ${input.trialDays} jours d’essai gratuit.`,
        heading: 'Votre parc grandit',
        blocks: [
          { type: 'p', text: hello(input.name) },
          { type: 'p', text: `Vous suivez maintenant **${input.limit} machines** sur Tracteurs & Co, le maximum de la formule Gratuit. Bravo, votre carnet d’entretien prend forme.` },
          { type: 'p', text: `Avec la formule Complet (${input.priceLabel}), vous suivez **autant de machines que vous voulez**, avec l’aide au diagnostic des pannes et le rapport pour la revente.` },
          { type: 'button', label: `Essayer ${input.trialDays} jours gratuitement`, url: `${site}/app/abonnement` },
          { type: 'note', text: 'Rien n’est débité pendant l’essai, et vous pouvez résilier en un clic depuis votre compte.' },
        ],
        reason: 'Vous recevez cet e-mail parce que vous êtes membre de Tracteurs & Co et que les annonces sont activées sur votre compte.',
        preferencesUrl: input.preferencesUrl,
      },
      site,
    );
  }
  return build(
    input.machines ? 'Vos machines vous attendent sur Tracteurs & Co' : 'Ajoutez votre premier tracteur en 1 minute',
    {
      preheader: input.machines ? 'Mettez à jour les compteurs pour recevoir les rappels d’entretien au bon moment.' : 'Le carnet d’entretien et les rappels se mettent en place tout seuls.',
      heading: input.machines ? 'Un compteur à mettre à jour ?' : 'Votre parc est encore vide',
      blocks: [
        { type: 'p', text: hello(input.name) },
        input.machines
          ? { type: 'p', text: `Vous suivez **${input.machines} machine${input.machines > 1 ? 's' : ''}** sur Tracteurs & Co. Notez les heures moteur de temps en temps : c’est ce qui permet de vous prévenir avant chaque vidange, filtre ou graissage.` }
          : { type: 'p', text: 'Vous avez créé votre compte, mais votre parc est encore vide. Choisissez votre tracteur dans nos fiches techniques : les intervalles d’entretien du constructeur sont repris automatiquement.' },
        { type: 'button', label: input.machines ? 'Mettre à jour mes compteurs' : 'Ajouter ma première machine', url: `${site}/app/materiel` },
        { type: 'note', text: 'Une panne ? L’aide au diagnostic vous indique les causes possibles et quoi vérifier, dans l’ordre.' },
      ],
      reason: 'Vous recevez cet e-mail parce que vous êtes membre de Tracteurs & Co et que les annonces sont activées sur votre compte.',
      preferencesUrl: input.preferencesUrl,
    },
    site,
  );
}

// ---------------------------------------------------------------------
// Parc partagé
// ---------------------------------------------------------------------

/** Invitation à rejoindre le parc matériel d'une exploitation. */
export function fleetInviteEmail(input: { from: string; role: string; url: string }, siteUrl: string): BuiltEmail {
  const site = siteUrl.replace(/\/$/, '');
  return build(
    `${input.from} vous invite sur son parc matériel`,
    {
      preheader: 'Suivez les machines, les compteurs et les entretiens sur Tracteurs & Co.',
      heading: 'Vous êtes invité sur un parc matériel',
      blocks: [
        { type: 'p', text: 'Bonjour,' },
        { type: 'p', text: `**${input.from}** vous invite à rejoindre son parc matériel sur Tracteurs & Co, avec l’accès **${input.role}**.` },
        {
          type: 'p',
          text:
            input.role === 'Lecture seule'
              ? 'Vous pourrez consulter les machines, leur carnet d’entretien et les prochaines échéances.'
              : 'Vous pourrez consulter les machines et noter les relevés de compteur et les entretiens que vous faites.',
        },
        { type: 'button', label: 'Accepter l’invitation', url: input.url },
        { type: 'note', text: 'Pas encore de compte ? Il se crée en une minute depuis ce lien, gratuitement. Si vous ne connaissez pas cette personne, ignorez simplement cet e-mail.' },
      ],
      reason: 'Vous recevez cet e-mail parce qu’un membre de Tracteurs & Co vous a invité sur son parc matériel.',
    },
    site,
  );
}

// ---------------------------------------------------------------------
// Boutique
// ---------------------------------------------------------------------

export const SHOP_TEMPLATES = ['commande_confirmee', 'commande_expediee', 'commande_retardee', 'commande_remboursee'] as const;
export type ShopTemplate = (typeof SHOP_TEMPLATES)[number];

export type ShopEmailInput = {
  name?: string | null;
  /** Référence courte de la commande, ex. « B-3F2A9C1D ». */
  reference: string;
  /** Lignes lisibles : « 2 × T-shirt Tracteurs & Co (Noir, M) — 45,00 € ». */
  lines: string[];
  total: string;
  shipping: string;
  discount?: string | null;
  address?: string | null;
  delay?: string | null;
  tracking?: { carrier: string; number: string; url: string }[];
};

const SHOP_REASON = 'Vous recevez cet e-mail parce qu’il concerne une commande passée sur la boutique Tracteurs & Co.';

export function shopEmail(template: ShopTemplate, input: ShopEmailInput, siteUrl: string): BuiltEmail {
  const site = siteUrl.replace(/\/$/, '');
  const orders = `${site}/app/boutique/commandes`;
  const recap = [
    ...input.lines,
    ...(input.discount ? [`Remise formule Complet : −${input.discount}`] : []),
    `Livraison : ${input.shipping}`,
    `**Total payé : ${input.total}**`,
  ].join('\n');
  switch (template) {
    case 'commande_confirmee':
      return build(
        `Commande ${input.reference} confirmée`,
        {
          preheader: `Merci ! Votre commande est partie à l’impression${input.delay ? `, livraison estimée ${input.delay}` : ''}.`,
          heading: 'Merci pour votre commande',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: `Votre paiement est bien reçu. Vos articles sont imprimés à la demande, puis expédiés${input.delay ? ` : comptez **${input.delay}** pour la livraison` : ''}. Vous recevrez un e-mail avec le numéro de suivi dès l’envoi.` },
            { type: 'p', text: recap },
            ...(input.address ? [{ type: 'note' as const, text: `Livraison à : ${input.address}` }] : []),
            { type: 'button', label: 'Suivre ma commande', url: orders },
          ],
          reason: SHOP_REASON,
        },
        site,
      );
    case 'commande_expediee':
      return build(
        `Votre commande ${input.reference} est en route`,
        {
          preheader: 'Votre colis vient de partir. Voici de quoi le suivre.',
          heading: 'Votre colis est en route',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: 'Bonne nouvelle : votre commande vient d’être expédiée.' },
            ...(input.tracking ?? []).map((t) => ({ type: 'p' as const, text: `Transporteur **${t.carrier}**, numéro de suivi **${t.number}**` })),
            ...(input.tracking?.[0]?.url ? [{ type: 'button' as const, label: 'Suivre le colis', url: input.tracking[0].url }] : [{ type: 'button' as const, label: 'Voir ma commande', url: orders }]),
            { type: 'p', text: recap },
          ],
          reason: SHOP_REASON,
        },
        site,
      );
    case 'commande_retardee':
      return build(
        `Commande ${input.reference} : un petit contretemps`,
        {
          preheader: 'Votre commande demande une vérification de notre part. On s’en occupe.',
          heading: 'Votre commande est en vérification',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: 'Votre paiement est bien reçu, mais l’atelier d’impression a mis votre commande en attente (adresse à vérifier ou article momentanément indisponible). Nous nous en occupons et revenons vers vous rapidement ; si elle ne peut pas être honorée, vous serez remboursé intégralement.' },
            { type: 'p', text: recap },
            { type: 'button', label: 'Voir ma commande', url: orders },
          ],
          reason: SHOP_REASON,
        },
        site,
      );
    case 'commande_remboursee':
      return build(
        `Commande ${input.reference} remboursée`,
        {
          preheader: 'Le remboursement est en cours vers votre carte.',
          heading: 'Votre commande est remboursée',
          blocks: [
            { type: 'p', text: hello(input.name) },
            { type: 'p', text: `Le remboursement de votre commande **${input.reference}** est lancé. Il apparaît sur votre compte bancaire sous 5 à 10 jours selon votre banque.` },
            { type: 'p', text: recap },
          ],
          reason: SHOP_REASON,
        },
        site,
      );
  }
}

// ---------------------------------------------------------------------
// Bourse au matériel
// ---------------------------------------------------------------------

/** Nouveau message reçu sur une annonce (un seul e-mail tant que les messages précédents ne sont pas lus). */
export function listingMessageEmail(input: { name?: string | null; from: string; listingTitle: string; preview: string; url: string; seller: boolean }, siteUrl: string): BuiltEmail {
  const site = siteUrl.replace(/\/$/, '');
  return build(
    `${input.from} vous a écrit : ${input.listingTitle}`,
    {
      preheader: input.preview.slice(0, 120),
      heading: input.seller ? 'Un acheteur s’intéresse à votre annonce' : 'Le vendeur vous a répondu',
      blocks: [
        { type: 'p', text: hello(input.name) },
        { type: 'p', text: `**${input.from}** vous a envoyé un message à propos de « ${input.listingTitle} » :` },
        { type: 'note', text: input.preview.length > 400 ? `${input.preview.slice(0, 400)}…` : input.preview, tone: 'info' },
        { type: 'button', label: 'Répondre', url: input.url },
        { type: 'p', text: 'Pour votre sécurité, échangez et payez sur Tracteurs & Co : ne communiquez pas vos coordonnées bancaires et méfiez-vous des demandes de paiement par mandat, coupon ou virement à l’étranger.' },
      ],
      reason: 'Vous recevez cet e-mail parce que vous avez une conversation en cours sur la bourse au matériel de Tracteurs & Co.',
    },
    site,
  );
}
