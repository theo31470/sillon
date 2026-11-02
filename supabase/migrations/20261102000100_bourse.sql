-- =====================================================================
-- Bourse au matériel : petites annonces entre membres (pièces, outils,
-- machines), messagerie acheteur ↔ vendeur, favoris, signalements, et
-- estimations du prix de revente des machines du parc.
-- Lecture publique des annonces en ligne ; tout le reste réservé aux
-- personnes concernées (RLS). Les comptes suspendus et la démo n'écrivent pas.
-- =====================================================================

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  -- Référence courte dans l'adresse de l'annonce (/bourse/<titre>-<ref>).
  ref text not null unique default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  seller_id uuid not null references public.profiles (id) on delete cascade,
  machine_id uuid references public.machines (id) on delete set null,
  sheet_id uuid references public.tech_sheets (id) on delete set null,
  title text not null check (char_length(title) between 5 and 90),
  description text not null default '' check (char_length(description) <= 5000),
  category text not null check (category in ('tracteur', 'recolte', 'travail_sol', 'semis', 'pulverisation', 'fenaison', 'elevage', 'manutention', 'remorque', 'pieces', 'pneus', 'outillage', 'autre')),
  condition text not null check (condition in ('neuf', 'tres_bon', 'bon', 'correct', 'pour_pieces')),
  price_cents integer not null check (price_cents between 100 and 100000000),
  negotiable boolean not null default false,
  brand text not null default '' check (char_length(brand) <= 60),
  model text not null default '' check (char_length(model) <= 80),
  year integer check (year between 1900 and 2100),
  hours numeric(9, 1) check (hours >= 0),
  postal_code text not null check (postal_code ~ '^[0-9]{5}$'),
  city text not null check (char_length(city) between 1 and 100),
  department text not null check (department ~ '^(\d{2}|2A|2B|97\d)$'),
  -- Remise : envoi par colis, en main propre, ou les deux au choix de l'acheteur.
  delivery text not null default 'main_propre' check (delivery in ('envoi', 'main_propre', 'les_deux')),
  weight_kg numeric(7, 2) check (weight_kg > 0 and weight_kg <= 70),
  photos jsonb not null default '[]'::jsonb,
  status text not null default 'brouillon' check (status in ('brouillon', 'en_ligne', 'reservee', 'vendue', 'retiree', 'moderee')),
  moderation_note text,
  views integer not null default 0,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists listings_public_idx on public.listings (status, published_at desc);
create index if not exists listings_seller_idx on public.listings (seller_id, created_at desc);
create index if not exists listings_category_idx on public.listings (category, status);
create index if not exists listings_department_idx on public.listings (department, status);

alter table public.listings enable row level security;
create policy "bourse : annonces publiées visibles par tous" on public.listings
  for select to anon, authenticated using (status in ('en_ligne', 'reservee', 'vendue'));
create policy "bourse : le vendeur voit les siennes" on public.listings
  for select to authenticated using (seller_id = (select auth.uid()) or (select private.is_admin()));
create policy "bourse : le vendeur publie" on public.listings
  for insert to authenticated
  with check (seller_id = (select auth.uid()) and (select private.is_active_member()) and status in ('brouillon', 'en_ligne'));
create policy "bourse : le vendeur modifie les siennes" on public.listings
  for update to authenticated
  using (seller_id = (select auth.uid()) and status <> 'moderee')
  with check (seller_id = (select auth.uid()) and (select private.is_active_member()) and status in ('brouillon', 'en_ligne', 'reservee', 'vendue', 'retiree'));
create policy "bourse : le vendeur supprime les siennes" on public.listings
  for delete to authenticated using (seller_id = (select auth.uid()));

-- Conversations : une par annonce et par acheteur.
create table if not exists public.listing_conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  buyer_read_at timestamptz,
  seller_read_at timestamptz,
  unique (listing_id, buyer_id),
  check (buyer_id <> seller_id)
);
create index if not exists listing_conversations_buyer_idx on public.listing_conversations (buyer_id, last_message_at desc);
create index if not exists listing_conversations_seller_idx on public.listing_conversations (seller_id, last_message_at desc);
alter table public.listing_conversations enable row level security;
create policy "bourse : les deux parties voient la conversation" on public.listing_conversations
  for select to authenticated using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete on public.listing_conversations from anon, authenticated;

create table if not exists public.listing_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.listing_conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists listing_messages_conv_idx on public.listing_messages (conversation_id, created_at);
alter table public.listing_messages enable row level security;
create policy "bourse : les deux parties lisent les messages" on public.listing_messages
  for select to authenticated
  using (exists (
    select 1 from public.listing_conversations c
    where c.id = conversation_id and (c.buyer_id = (select auth.uid()) or c.seller_id = (select auth.uid()) or (select private.is_admin()))
  ));
-- Messages écrits par le serveur (contrôles anti-abus, e-mail au destinataire).
revoke insert, update, delete on public.listing_messages from anon, authenticated;

create table if not exists public.listing_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
alter table public.listing_favorites enable row level security;
create policy "bourse : ses favoris" on public.listing_favorites
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  reason text not null check (reason in ('arnaque', 'interdit', 'doublon', 'mauvaise_categorie', 'deja_vendu', 'autre')),
  details text not null default '' check (char_length(details) <= 1000),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists listing_reports_open_idx on public.listing_reports (handled_at, created_at desc);
alter table public.listing_reports enable row level security;
create policy "bourse : signalements lus par l'admin" on public.listing_reports
  for select to authenticated using ((select private.is_admin()));
revoke insert, update, delete on public.listing_reports from anon, authenticated;

-- Prix de revente estimé d'une machine du parc (gardé 30 jours).
create table if not exists public.machine_valuations (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  low_cents integer not null,
  mid_cents integer not null,
  high_cents integer not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists machine_valuations_machine_idx on public.machine_valuations (machine_id, created_at desc);
alter table public.machine_valuations enable row level security;
create policy "estimation : le titulaire de la machine" on public.machine_valuations
  for select to authenticated
  using (exists (select 1 from public.machines m where m.id = machine_id and m.user_id = (select auth.uid())));
revoke insert, update, delete on public.machine_valuations from anon, authenticated;

-- Consommation de Claude pour les estimations.
alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('diagnostic', 'sheet_generation', 'sheet_revision', 'sheet_research', 'catalog_listing', 'photo_selection', 'invoice_reading', 'valuation'));
