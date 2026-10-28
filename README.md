# Tracteurs & Co

Le carnet de santé numérique du matériel agricole. Site vitrine, blog et base de fiches techniques
(caractéristiques, entretien, pannes connues et tests), et un SaaS pour suivre son parc : relevés de compteur,
carnet d’entretien automatique avec rappels, dépenses, coût de revient à l’heure et rapport d’historique pour la
revente. Un espace administrateur sécurisé gère membres, abonnements, blog et fiches techniques (rédigées par
Claude puis validées par un humain).

## Sommaire

1. [Technologies](#technologies)
2. [Structure du projet](#structure-du-projet)
3. [Installation en local](#installation-en-local)
4. [Configuration des services](#configuration-des-services)
5. [Sécurité](#sécurité)
6. [Fiches techniques générées par Claude](#fiches-techniques-générées-par-claude)
7. [Tests et vérifications](#tests-et-vérifications)
8. [Mise en ligne](#mise-en-ligne)
9. [Avant d’ouvrir au public](#avant-douvrir-au-public)
10. [Travailler en équipe](#travailler-en-équipe)

## Technologies

| Rôle | Outil |
| --- | --- |
| Site et application | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Base de données, comptes, fichiers | Supabase (Postgres + Auth + Storage) |
| Paiements | Stripe (Checkout, portail client, webhooks) |
| IA | API Claude d’Anthropic (fiches techniques, aide au diagnostic) |

## Structure du projet

```
supabase/
  migrations/…_init.sql   Schéma complet + règles de sécurité (RLS) + stockage
  seed.sql                Données de démonstration (facultatif)
scripts/test-db.mjs       Tests automatiques des règles de sécurité de la base
src/
  proxy.ts                Rafraîchit la session et filtre les accès (ex-middleware)
  lib/
    auth.ts               Vérification des droits (membre, admin + double authentification)
    ai.ts                 Appels à Claude (fiches, corrections, diagnostic)
    sheets/schema.ts      Format d’une fiche technique (partagé IA / base / affichage)
    supabase/             Clients Supabase (navigateur, serveur, clé secrète)
    fleet.ts              Parc matériel de l’exploitant (machines, relevés, entretiens, dépenses)
    maintenance.ts        Échéances d’entretien (heures ou mois, au premier terme atteint)
    costs.ts              Coût de revient à l’heure (charges fixes + variables)
    stripe.ts, audit.ts, rate-limit.ts, markdown.ts…
  app/
    (site)/               Pages publiques : accueil, blog, fiches, tarifs, pages légales
    (auth)/               Connexion, inscription, mot de passe oublié
    securite/2fa/         Double authentification (obligatoire pour l’admin)
    app/                  Espace exploitant : tableau de bord, parc matériel (fiche machine,
                          rapport pour la revente), diagnostic, abonnement, compte
    admin/                Espace administrateur : vue d’ensemble, membres, paiements,
                          blog, fiches techniques (IA), journal d’activité
    api/                  Webhook Stripe, exports de données, génération des fiches
  components/             Éléments d’interface partagés
```

## Installation en local

Prérequis : Node.js 22.

```bash
git clone https://github.com/theo31470/sillon.git
cd sillon
npm install
cp .env.example .env.local   # puis remplissez les valeurs (voir ci-dessous)
npm run dev                  # http://localhost:3000
```

Sans clés, les pages publiques s’affichent mais la connexion et l’application ne fonctionnent pas.

## Configuration des services

### 1. Supabase

1. Créez un projet sur [supabase.com](https://supabase.com) (choisissez une région en Europe).
2. **SQL Editor** : exécutez le contenu de `supabase/migrations/…_init.sql`, puis (facultatif) `supabase/seed.sql`.
   Avec la CLI Supabase : `supabase link` puis `supabase db push`.
3. **Project Settings → API Keys** : copiez l’URL, la clé publique et la clé secrète dans `.env.local`.
4. **Authentication → URL Configuration** : *Site URL* = votre adresse ; ajoutez `http://localhost:3000/**`
   et `https://votre-domaine.fr/**` aux *Redirect URLs*.
5. **Authentication → Multi-Factor** : activez **TOTP** (application d’authentification).
6. **Authentication → Hooks → Send Email** : les e-mails de compte sont envoyés par le site (voir « E-mails »
   plus bas). Inutile de modifier les modèles d’e-mail de Supabase.
7. Créez votre compte sur le site, puis donnez-vous les droits admin dans le SQL Editor :
   ```sql
   update public.profiles set role = 'admin' where email = 'votre@email.fr';
   ```
   À la première visite de `/admin`, le site vous demandera d’activer la double authentification.

### 2. Stripe

1. **Catalogue de produits** : créez le produit « Tracteurs & Co Complet » avec un prix mensuel récurrent.
   et deux prix récurrents TTC : **6,99 € / mois** et **69 € / an**. Copiez leurs identifiants `price_…` dans
   `STRIPE_PRICE_COMPLET` (mensuel) et `STRIPE_PRICE_COMPLET_ANNUEL` (annuel). Les prix affichés sont dans
   `src/lib/plans.ts` (`COMPLET_PRICES`) : gardez-les alignés avec Stripe.
2. **Developers → Webhooks** : ajoutez l’adresse `https://votre-domaine.fr/api/stripe/webhook` avec les événements
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
   Copiez le secret `whsec_…` dans `STRIPE_WEBHOOK_SECRET`.
   En local : `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
3. **Settings → Billing → Customer portal** : activez le portail (résiliation, moyens de paiement, factures,
   passage mensuel ↔ annuel). En mode test, produit, prix, webhook et portail ont été créés par l'API ;
   à refaire à l'identique en mode réel. Le pied de facture (SIRET, mention de TVA) est posé sur chaque client
   à sa création (`src/app/app/abonnement/actions.ts`).
4. **Settings → Billing → Revenue recovery** : réglez les relances automatiques des paiements échoués.

### 3. E-mails (Resend)

Tous les e-mails partent du site, aux couleurs de Tracteurs & Co, par [Resend](https://resend.com)
(gratuit jusqu’à 3 000 e-mails/mois, 100/jour). Code : `src/lib/email/`.

1. **Nom de domaine** : il en faut un (ex. `tracteurs-and-co.com`), sans quoi Resend n’écrit qu’au propriétaire du compte.
2. **Resend → Domains** : ajoutez le domaine, puis créez chez l’hébergeur du domaine les enregistrements DNS
   indiqués (DKIM, SPF, et DMARC recommandé). Attendez le statut « Verified ».
3. **Resend → API Keys** : créez une clé « Sending access » → `RESEND_API_KEY` (Vercel, option *Sensitive*).
4. `EMAIL_FROM` = `Tracteurs & Co <bonjour@votre-domaine.fr>` ; `EMAIL_REPLY_TO` (facultatif) = une boîte que vous lisez.
5. **Supabase → Authentication → Hooks → Send Email** : type *HTTPS*, adresse
   `https://votre-domaine.fr/api/auth/email-hook`, bouton *Generate secret* → copiez le secret (`v1,whsec_…`)
   dans `SEND_EMAIL_HOOK_SECRET` (Vercel, *Sensitive*), redéployez, **puis** activez le hook.
   Sans hook, Supabase continue d’envoyer ses propres e-mails (en anglais, limités à quelques par heure).
6. Facultatif : **Authentication → Emails → Security notifications** pour les alertes (mot de passe modifié…).
7. **Rappels d’entretien** : exécutez la partie « Rappels » de `supabase/cron.sql` (tous les matins, 7 h).

E-mails gérés :

- **Compte** (via le hook Supabase, signature vérifiée) : inscription, mot de passe oublié, lien de connexion,
  invitation, changement d’adresse (ancienne et nouvelle), code de vérification, alertes de sécurité.
- **Rappels d’entretien** (`/api/e-mails/rappels`) : une tournée par jour (verrou `reminder_runs`) ; un membre est
  prévenu quand une échéance passe « bientôt » puis « en retard », une seule fois par niveau (`maintenance_reminders`),
  dans un seul e-mail récapitulatif.
- **Annonces** (`/admin/emails`) : rédaction en Markdown, aperçu, test sur sa propre adresse, envoi par paquets de 100.
- Chaque rappel et annonce porte un lien « Gérer mes e-mails » (`/preferences-e-mail`, sans connexion grâce à un
  jeton propre à chaque membre) et l’en-tête de désinscription en un clic (Gmail, Apple Mail). Préférences aussi
  dans « Mon compte ».
- Journal de tous les envois : table `email_log`, visible dans l’admin. Aperçu de tous les modèles : `/admin/emails/modeles`.

### 4. Claude (Anthropic)

Créez une clé sur [console.anthropic.com](https://console.anthropic.com) et mettez-la dans `ANTHROPIC_API_KEY`.
L’usage est facturé au nombre de tokens : la consommation de chaque appel est enregistrée dans la table `ai_usage`.
Fixez une limite de dépense dans la console Anthropic.

## Parc matériel (espace exploitant)

- **Machines** : type, marque, modèle, année, n° de série, immatriculation, fiche technique liée.
  Formule gratuite : 3 machines (limite appliquée dans la base) ; Complet : illimité.
- **Relevés de compteur** (`hour_readings`) : le compteur ne recule jamais ; chaque relevé sert au calcul des heures annuelles.
- **Carnet d’entretien** : plan repris de la fiche technique (opérations avec intervalle) + plan personnalisé
  (`machine_tasks`, qui remplace l’opération de même nom). Échéance au premier terme atteint (heures ou mois),
  statuts « en retard », « bientôt » (25 h / 10 % de l’intervalle ou 30 jours), « à jour ».
- **Dépenses** (`machine_costs`, € HT) : carburant (avec litres → L/h), entretien, réparations, pneumatiques,
  assurance, autres. Un entretien noté avec un coût crée la dépense correspondante.
- **Coût de revient à l’heure** (`src/lib/costs.ts`, formule Complet) : charges fixes annuelles (amortissement
  (prix − revente) / durée, frais financiers sur le capital moyen, assurance) ÷ heures annuelles, plus charges
  variables des 12 derniers mois ÷ heures travaillées sur la période. Heures annuelles : relevés sur au moins
  2 mois, sinon estimation saisie. Marge affichée si un tarif facturé à l’heure est renseigné (CUMA, ETA).
- **Rapport pour la revente** (`/app/materiel/[id]/rapport`, formule Complet) : identité, entretiens, relevés,
  dépenses par année en option ; imprimable en PDF.

## Sécurité

Plusieurs couches indépendantes protègent les données :

- **Base de données (RLS)** : chaque table a des règles d’accès. Un exploitant ne voit que ses données ;
  les droits admin exigent le rôle `admin` **et** une session validée par double authentification (`aal2`).
  Même un administrateur ne lit pas le parc matériel ni les dépenses des exploitants.
- **Champs protégés** : un membre ne peut pas modifier son rôle, sa formule ou sa suspension (droits SQL par colonne).
- **Serveur** : chaque page et chaque action vérifient à nouveau les droits (`src/lib/auth.ts`).
  Le proxy ne fait qu’un premier filtrage.
- **Double authentification** obligatoire pour l’admin. Les actions sensibles (suspension, suppression,
  changement de rôle, export de données) demandent un code saisi depuis moins de 15 minutes.
  Déconnexion de l’admin après 30 min d’inactivité.
- **Journal d’activité** non modifiable depuis le site (écrit uniquement côté serveur).
- **Paiements** : aucune donnée de carte ne transite par Tracteurs & Co ; le webhook vérifie la signature Stripe.
- **Contenus** : les articles sont rendus avec échappement du HTML (pas d’injection de script possible).
- **En-têtes HTTP** : HSTS, CSP, interdiction d’affichage en iframe, etc. (`next.config.ts`).
- **Mots de passe** : 10 caractères minimum avec majuscule, minuscule et chiffre (mêmes règles que dans Supabase),
  et refus des mots de passe déjà apparus dans des fuites (service Pwned Passwords, méthode « k-anonymat » :
  seuls 5 caractères de l’empreinte SHA-1 sont envoyés, voir `src/lib/pwned.ts`). Si le service ne répond pas,
  l’inscription n’est pas bloquée.
- **Limitation de débit** sur la connexion, l’inscription, l’IA et les exports.
- **Redirections** limitées aux pages internes (pas de redirection vers un site piégé).

## Fiches techniques générées par Claude

1. L’admin dépose 1 à 3 PDF (manuel constructeur, catalogue de pièces…) dans **Admin → Fiches techniques**.
2. Les PDF vont dans un stockage privé, puis le serveur les transmet à Claude avec des consignes strictes :
   utiliser uniquement ces documents, citer la page pour chaque valeur, et marquer « à vérifier » tout ce qui
   est absent ou contradictoire.
3. La réponse suit un format imposé (`src/lib/sheets/schema.ts`) et est validée à la réception.
4. L’admin relit : chaque champ affiche sa source et une case « Vérifié ». Il peut demander une correction à Claude.
5. **La publication est bloquée côté serveur tant qu’un seul champ reste à vérifier.**

### Import des tracteurs par marque (sans PDF)

**Admin → Fiches techniques → Importer les tracteurs d’une marque** (`/admin/fiches/catalogue`) :

1. **Lister** : on choisit une marque (et éventuellement une série ou une période). Claude parcourt le site du
   constructeur avec la recherche web et propose la liste des modèles (série, années, puissance, page source).
2. **Choisir** : on coche les modèles voulus, puis « Générer les fiches sélectionnées ».
3. **Génération automatique** : une file d’attente traite chaque modèle en deux étapes, chacune dans une fonction
   serveur de 5 minutes maximum :
   - *recherche* : Claude lit le site du constructeur (pages produit, brochures PDF) puis la presse spécialisée,
     et rédige un dossier où chaque valeur est suivie de son adresse ;
   - *rédaction* : Claude remplit la fiche à partir de ce seul dossier, chaque valeur avec sa source (lien cliquable).
   Une valeur n’est marquée « vérifiée » que si elle vient du constructeur ou de deux sources concordantes.
4. Les fiches arrivent dans **À relire**. Le bouton « Cocher les valeurs sourcées » accélère la relecture.
   Les sources apparaissent en bas de la fiche publique.

La file tourne **sur le serveur, même page fermée** : chaque minute, la base (extensions `pg_cron` + `pg_net`)
appelle `/api/catalogue/tick`, qui traite une étape. Au plus 3 étapes en parallèle. Mise en place : exécuter
**`supabase/cron.sql`** une fois dans le SQL Editor (en remplaçant l’adresse du site).

**Maîtrise des coûts** (leçon du premier essai : ~1,30 $ par fiche avec Sonnet et des brochures lues en entier) :
- l’import utilise **Haiku 5.5** (`ANTHROPIC_IMPORT_MODEL`), 20 fois moins cher que Sonnet tant qu’une requête
  reste sous 100 000 tokens ;
- **une seule recherche web par série** (ex. Fendt 700 Vario), réutilisée pour chaque modèle de la série ;
- 4 recherches et 1 page lue (12 000 tokens maximum) par série ;
- chaque appel enregistre son coût estimé dans `ai_usage.cost_usd` ; l’écran d’import affiche la dépense du jour et
  une estimation avant de lancer ;
- **pause automatique** de la file quand `CATALOG_DAILY_BUDGET_USD` (1 $ par défaut) est atteint, ou quand les
  crédits Anthropic sont épuisés.
Fixez aussi une limite de dépense mensuelle dans la console Anthropic.

**Entretien, pannes et tests** : en parallèle du dossier technique, une seconde recherche par série cible le plan
d’entretien (manuels, carnets), les pannes connues (rappels, presse agricole, problèmes rapportés par plusieurs
propriétaires sur les forums) et les tests à faire. Chaque opération et chaque panne affiche son **origine** :
*Constructeur*, *Presse agricole*, *Retours d’utilisateurs* ou *Repère indicatif* (pratique habituelle pour ce type de
tracteur, ajoutée quand les sources sont muettes, sans capacité ni référence inventée). Les retours d’utilisateurs et
les repères indicatifs sont toujours « à vérifier » : la fiche ne peut pas être publiée sans relecture. L’origine est
modifiable dans la relecture.

**Photos** : après la rédaction, Tracteurs & Co cherche une photo du modèle sur **Wikimedia Commons** (licences libres
uniquement : CC BY, CC BY-SA, CC0, domaine public). Claude regarde les candidates et ne retient qu’une photo qui montre
clairement ce modèle ; sinon la fiche garde son illustration. La photo est copiée dans le stockage `media` et la fiche
affiche **auteur, licence et lien vers la source**, comme l’exigent ces licences. Dans la relecture, l’admin peut
relancer la recherche, retirer la photo ou **déposer une photo** (photo presse, photo personnelle) : auteur et
autorisation sont alors obligatoires. Les photos des constructeurs, de la presse ou des annonces sont protégées
par le droit d’auteur : citer la source ne suffit pas, il faut l’accord du détenteur des droits.

**Sources exclues** (`BLOCKED_DOMAINS` dans `src/lib/ai-web.ts`) : bases de caractéristiques d’autres éditeurs et
petites annonces. En droit européen, reprendre systématiquement le contenu d’une base de données tierce est interdit,
même valeur par valeur (droit *sui generis* des bases de données). Les sites des constructeurs restent la source principale.

**Tarifs de référence** (à vérifier sur la page tarifs d’Anthropic) : recherche web 10 $ les 1 000 ; Haiku 5.5 0,10 $ /
0,50 $ par million de tokens (entrée / sortie, sous 100 000 tokens par requête) ; Sonnet 5.5 2 $ / 10 $. Les prix
utilisés pour l’estimation sont dans `src/lib/ai.ts` (`PRICES`).

## Tests et vérifications

```bash
npm run lint        # qualité du code
npm run typecheck   # typage TypeScript
npm run build       # build de production
npm run test:db     # lance un vrai Postgres local et vérifie les règles de sécurité (une cinquantaine de tests)
```

`test:db` vérifie notamment qu’un exploitant ne voit pas les données d’un autre, ne peut pas se donner
les droits admin, que la formule gratuite est limitée à 3 machines, qu’un admin sans double authentification
n’a aucun droit étendu, et qu’un compte suspendu ne peut plus écrire. (À lancer hors compte root.)

## Mise en ligne

Le plus simple : [Vercel](https://vercel.com).

1. Importez le dépôt GitHub dans Vercel.
2. Renseignez toutes les variables de `.env.example` (avec l’adresse définitive dans `NEXT_PUBLIC_SITE_URL`).
3. Déployez, puis mettez à jour l’adresse du webhook Stripe et les URL de redirection Supabase.

## Avant d’ouvrir au public

- [ ] Rédiger les pages légales (`src/app/(site)/[legal]/page.tsx`) avec un professionnel (mentions, RGPD, CGU).
- [ ] Remplacer les emplacements photo par de vraies photos.
- [ ] Faire relire la méthode du coût de revient par un conseiller machinisme (chambre d’agriculture, FDCUMA).
- [ ] Remplacer la limitation de débit en mémoire par un stockage partagé (ex. Upstash Redis) si le site
      tourne sur plusieurs serveurs (cas de Vercel).
- [ ] Durcir la CSP avec des nonces (guide Next.js « Content Security Policy »).
- [ ] Activer les sauvegardes quotidiennes Supabase (offre payante) et la limite de dépense Anthropic.
- [ ] Acheter le nom de domaine, le vérifier dans Resend et activer le hook « Send Email » (voir « E-mails »).

## À reprendre (notes d’équipe)

- **Stripe en mode réel** (26/10/2026) : compte activé. Créés par l'API en réel : produit `prod_VVw1RdCLMVnBVH`,
  prix mensuel `price_1UUu9mBMy0t4Mfm1GAZtSGVZ` (6,99 €) et annuel `price_1UUu9nBMy0t4Mfm1ttWEITOh` (69 €),
  portail `bpc_1UUuA6BMy0t4Mfm1lN5vyJJO`, webhook `we_1UUuAIBMy0t4Mfm12EdKgIP7` (7 événements). Clé API : clé
  secrète standard `sk_live_…` (accès complet). Les données de test (client, abonnement, paiement) ont été effacées de la base.
  Reste dans le tableau de bord : informations publiques (nom, contact@) et e-mails clients.
- **Aide au diagnostic** (26/10/2026) : modèle Haiku 5.5 (`ANTHROPIC_DIAGNOSTIC_MODEL`, ~0,2 centime par diagnostic),
  quota compté en base : 30 par mois et 10 par 24 h (`src/lib/plans.ts`). À comparer avec Sonnet sur quelques pannes
  réelles une fois le crédit rechargé ; pour revenir à Sonnet, mettre `ANTHROPIC_DIAGNOSTIC_MODEL=claude-sonnet-5-5`.
- **Gestion des membres** (26/10/2026) : fiche `/admin/membres/[id]` (formule offerte hors Stripe, jours offerts,
  résiliation, remboursement, quota de diagnostics, infos, notes et étiquettes internes, activité, e-mail personnel)
  et liste filtrée/triée avec actions groupées (fonction `admin_member_list`, appelée côté serveur).
  Si la clé Stripe devient un jour une clé restreinte (`rk_`), y inclure Refunds (écriture) et Invoice Payments (lecture). Les formules
  offertes expirent chaque matin (tournée des rappels) ou à la visite suivante du membre.
- **Boutique de goodies et vêtements** (idée, 26/10/2026) : à l'ouverture, mettre à jour la description d'activité
  dans Stripe, déclarer l'activité commerciale (vente de marchandises) au guichet unique, rédiger des CGV grand public
  (rétractation 14 jours, livraison, retours). Piste : impression à la demande (pas de stock).
- **Mentions légales** : ajouter le téléphone de l'éditeur (`src/lib/site.ts`, champ `phone`).
- **DNS** (Vercel) : tracteursandco.fr (site, Resend, messagerie Amen MX + SPF `include:spf1/spf2.webapps.net`),
  tracteursandco.com (redirection, `v=spf1 -all`, DMARC reject). Ne pas modifier le MX Amen
  (Amen supprime les boîtes si le MX ne pointe plus chez eux).

- **Import des tracteurs — budget** (24/10/2026) : premier essai à ~1,30 $ par fiche (Sonnet, brochures lues en
  entier) ; version corrigée (Haiku, une recherche par série) estimée à ~3,5 centimes par fiche, soit ~250 fiches
  pour 10 € ; avec la recherche entretien/pannes ajoutée le 25/10 : ~5 centimes par fiche, soit ~180 fiches pour 10 €. **À valider** : lancer une seule série (Fendt 700 Vario, 5 modèles, estimation ≈ 0,17 $), comparer avec
  la dépense affichée dans l’écran d’import, puis recalculer. Les 57 Fendt sont déjà listés (« À générer »).
  Penser à fixer une limite de dépense mensuelle dans la console Anthropic.
- **Import : documentation officielle d'abord** (26/10/2026, soir) : le dossier technique d'une série est d'abord
  recopié depuis le site du constructeur (2 recherches et 2 pages lues au plus, limitées aux domaines officiels de
  `BRAND_SITES` / `EXTRA_BRAND_DOMAINS`), sous forme de tableaux modèle par modèle. Recherche élargie (presse) seulement
  si rien d'exploitable n'est trouvé. Bases de données tierces bloquées (droit des bases de données) : agridonnees,
  tractorbook ajoutés. Réflexion désactivée pendant la recherche (sinon dossier vide). Constat du 26/10 avant ce
  changement : ~0,16 $ par recherche (palier > 100 000 tokens de Haiku), fiches 900 Vario sans puissance par modèle.
- **Import : sources officielles par marque** (27–28/10/2026). Le site télécharge lui-même le tableau officiel
  (`src/lib/official-pages.ts`), suit les liens « brochure » des pages de série (PDF : seules les pages riches en
  données sont gardées, via `unpdf`), essaie la même page dans un autre pays (hreflang) si la brochure n'y est pas liée,
  et lit les données JSON des sites en JavaScript. Indications par marque : `TECHDATA_HINTS` (src/lib/ai-web.ts).
  Résultats : Fendt (api.fendt.com/techdata) et Claas (brochure PDF) 28 à 40 caractéristiques ; Case IH et New Holland
  (brochure sur cnhi-p-001-delivery.sitecorecontenthub.cloud) 25 à 37 ; Kubota (page de série partielle) 15 à 19 ;
  **John Deere : caractéristiques chargées en JavaScript depuis un service interne, inaccessibles** → recherche web en
  secours. Outil de mise au point temporaire : `/api/dev/probe` (jeton `PROBE_TOKEN`), à supprimer à la fin.
- Si la qualité des fiches rédigées par Haiku déçoit : repasser Sonnet pour la seule étape de rédaction (peu coûteuse).

## Choix techniques

- **Cache Components** (nouveauté Next.js 16) est désactivé : presque toutes les pages dépendent de la session,
  et le modèle classique est plus simple à maintenir en équipe. Il pourra être activé plus tard.
- **`proxy.ts`** remplace `middleware.ts` (nouvelle convention de Next.js 16).
- Le Markdown du blog utilise un petit moteur maison (`src/lib/markdown.ts`), volontairement limité et sûr.

## Travailler en équipe

- Une branche par fonctionnalité (`git checkout -b fonction/xxx`), puis une Pull Request vers `main`.
- Avant chaque PR : `npm run lint && npm run typecheck && npm run build`.
- Toute modification de la base passe par un **nouveau** fichier dans `supabase/migrations/` (ne jamais modifier
  une migration déjà appliquée), avec un test ajouté dans `scripts/test-db.mjs` si elle touche à la sécurité.
- Ne commitez jamais `.env.local` ni aucune clé.
