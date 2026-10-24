# Sillon

Application web pour les exploitations agricoles : site vitrine, blog, fiches techniques
du matériel, et un SaaS pour gérer parcelles, registre des interventions, météo et entretien
du matériel. Un espace administrateur sécurisé permet de gérer membres, abonnements, blog
et fiches techniques rédigées par Claude (IA) puis validées par un humain.

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
| Météo | Open-Meteo |

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
    stripe.ts, weather.ts, audit.ts, rate-limit.ts, markdown.ts…
  app/
    (site)/               Pages publiques : accueil, blog, fiches, tarifs, pages légales
    (auth)/               Connexion, inscription, mot de passe oublié
    securite/2fa/         Double authentification (obligatoire pour l’admin)
    app/                  Espace exploitant : tableau de bord, parcelles, interventions,
                          registre imprimable, matériel, diagnostic, abonnement, compte
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
6. **Authentication → Emails** (recommandé) : traduisez les modèles en français. Pour le rendu serveur, faites
   pointer les liens vers `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&suite=/app`
   (inscription) et `…&type=recovery&suite=/app/compte` (mot de passe).
7. Créez votre compte sur le site, puis donnez-vous les droits admin dans le SQL Editor :
   ```sql
   update public.profiles set role = 'admin' where email = 'votre@email.fr';
   ```
   À la première visite de `/admin`, le site vous demandera d’activer la double authentification.

### 2. Stripe

1. **Catalogue de produits** : créez le produit « Sillon Complet » avec un prix mensuel récurrent.
   Copiez son identifiant `price_…` dans `STRIPE_PRICE_COMPLET` et le prix affiché dans `NEXT_PUBLIC_PRICE_COMPLET_LABEL`.
2. **Developers → Webhooks** : ajoutez l’adresse `https://votre-domaine.fr/api/stripe/webhook` avec les événements
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
   Copiez le secret `whsec_…` dans `STRIPE_WEBHOOK_SECRET`.
   En local : `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
3. **Settings → Billing → Customer portal** : activez le portail (résiliation, moyens de paiement, factures).
4. **Settings → Billing → Revenue recovery** : réglez les relances automatiques des paiements échoués.

### 3. Claude (Anthropic)

Créez une clé sur [console.anthropic.com](https://console.anthropic.com) et mettez-la dans `ANTHROPIC_API_KEY`.
L’usage est facturé au nombre de tokens : la consommation de chaque appel est enregistrée dans la table `ai_usage`.
Fixez une limite de dépense dans la console Anthropic.

### 4. Météo (Open-Meteo)

L’API gratuite d’Open-Meteo est réservée aux usages **non commerciaux**. Sillon étant payant, souscrivez
une offre commerciale Open-Meteo et renseignez `OPEN_METEO_API_KEY` avant l’ouverture au public.

## Sécurité

Plusieurs couches indépendantes protègent les données :

- **Base de données (RLS)** : chaque table a des règles d’accès. Un exploitant ne voit que ses données ;
  les droits admin exigent le rôle `admin` **et** une session validée par double authentification (`aal2`).
  Même un administrateur ne lit pas les parcelles et interventions des exploitants.
- **Champs protégés** : un membre ne peut pas modifier son rôle, sa formule ou sa suspension (droits SQL par colonne).
- **Serveur** : chaque page et chaque action vérifient à nouveau les droits (`src/lib/auth.ts`).
  Le proxy ne fait qu’un premier filtrage.
- **Double authentification** obligatoire pour l’admin. Les actions sensibles (suspension, suppression,
  changement de rôle, export de données) demandent un code saisi depuis moins de 15 minutes.
  Déconnexion de l’admin après 30 min d’inactivité.
- **Journal d’activité** non modifiable depuis le site (écrit uniquement côté serveur).
- **Paiements** : aucune donnée de carte ne transite par Sillon ; le webhook vérifie la signature Stripe.
- **Contenus** : les articles sont rendus avec échappement du HTML (pas d’injection de script possible).
- **En-têtes HTTP** : HSTS, CSP, interdiction d’affichage en iframe, etc. (`next.config.ts`).
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
appelle `/api/catalogue/tick`, qui traite une étape. Au plus 3 étapes en parallèle, et `CATALOG_DAILY_LIMIT`
recherches par jour (150 par défaut). Mise en place : exécuter **`supabase/cron.sql`** une fois dans le SQL Editor
(en remplaçant l’adresse du site).

**Sources exclues** (`BLOCKED_DOMAINS` dans `src/lib/ai-web.ts`) : bases de caractéristiques d’autres éditeurs et
petites annonces. En droit européen, reprendre systématiquement le contenu d’une base de données tierce est interdit,
même valeur par valeur (droit *sui generis* des bases de données). Les sites des constructeurs restent la source principale.

**Coût** : recherche web facturée par Anthropic (10 $ les 1 000 recherches) + tokens. La consommation de chaque
étape est enregistrée dans `ai_usage` (tokens, recherches, pages lues). Fixez une limite de dépense dans la console Anthropic.

## Tests et vérifications

```bash
npm run lint        # qualité du code
npm run typecheck   # typage TypeScript
npm run build       # build de production
npm run test:db     # lance un vrai Postgres local et vérifie les règles de sécurité (25 tests)
```

`test:db` vérifie notamment qu’un exploitant ne voit pas les données d’un autre, ne peut pas se donner
les droits admin, que la formule gratuite est limitée à 5 parcelles, qu’un admin sans double authentification
n’a aucun droit étendu, et qu’un compte suspendu ne peut plus écrire. (À lancer hors compte root.)

## Mise en ligne

Le plus simple : [Vercel](https://vercel.com).

1. Importez le dépôt GitHub dans Vercel.
2. Renseignez toutes les variables de `.env.example` (avec l’adresse définitive dans `NEXT_PUBLIC_SITE_URL`).
3. Déployez, puis mettez à jour l’adresse du webhook Stripe et les URL de redirection Supabase.

## Avant d’ouvrir au public

- [ ] Rédiger les pages légales (`src/app/(site)/[legal]/page.tsx`) avec un professionnel (mentions, RGPD, CGU).
- [ ] Remplacer les emplacements photo par de vraies photos.
- [ ] Faire valider la réponse de la FAQ sur le registre et les mentions du registre imprimé par un conseiller.
- [ ] Prendre l’offre commerciale Open-Meteo.
- [ ] Remplacer la limitation de débit en mémoire par un stockage partagé (ex. Upstash Redis) si le site
      tourne sur plusieurs serveurs (cas de Vercel).
- [ ] Durcir la CSP avec des nonces (guide Next.js « Content Security Policy »).
- [ ] Activer les sauvegardes quotidiennes Supabase (offre payante) et la limite de dépense Anthropic.
- [ ] Traduire les e-mails Supabase et configurer un service d’envoi (SMTP) à votre nom de domaine.

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
