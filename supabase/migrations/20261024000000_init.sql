-- =====================================================================
-- Sillon — schéma initial
-- Principe : chaque table a la sécurité par ligne (RLS) activée.
--   * un exploitant ne voit et ne modifie QUE ses propres données ;
--   * les droits d'administration exigent le rôle 'admin' ET une session
--     validée par double authentification (aal2) ;
--   * les écritures sensibles (abonnements, paiements, journal) ne se font
--     que côté serveur avec la clé secrète (service role), jamais depuis
--     le navigateur.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  farm_name text not null default '',
  role text not null default 'member' check (role in ('member', 'admin')),
  plan text not null default 'free' check (plan in ('free', 'complet', 'groupement')),
  stripe_customer_id text unique,
  suspended boolean not null default false,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_search_idx on public.profiles (lower(farm_name), lower(full_name), lower(email));

-- Création automatique du profil à l'inscription.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, farm_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    left(coalesce(new.raw_user_meta_data ->> 'farm_name', ''), 120)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Garde l'e-mail du profil synchronisé avec auth.users.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------
-- Fonctions d'autorisation (utilisées par les règles RLS)
-- ---------------------------------------------------------------------

-- Admin = rôle admin ET session en double authentification (aal2).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' and not p.suspended
       from public.profiles p
      where p.id = (select auth.uid()))
    and coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2',
    false
  );
$$;

-- Membre actif = connecté et non suspendu.
create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select not p.suspended from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_active_member() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_member() to authenticated;

-- Mise à jour automatique de updated_at.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Un membre ne peut modifier que son nom, son exploitation et sa position.
-- Rôle, formule, suspension et client Stripe ne bougent que côté serveur.
alter table public.profiles enable row level security;

create policy "profil : lecture du sien" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profil : lecture admin" on public.profiles
  for select to authenticated using ((select public.is_admin()));
create policy "profil : modification du sien" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and (select public.is_active_member()))
  with check (id = (select auth.uid()));

revoke update on public.profiles from authenticated, anon;
grant update (full_name, farm_name, latitude, longitude) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- Abonnements et paiements (écrits uniquement par le webhook Stripe)
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id text primary key,                      -- identifiant Stripe sub_...
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null,                     -- trialing, active, past_due, canceled...
  plan text not null default 'complet',
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id);

create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

create table public.payments (
  id text primary key,                      -- identifiant Stripe in_...
  user_id uuid references public.profiles (id) on delete set null,
  amount_cents integer not null,
  currency text not null default 'eur',
  status text not null check (status in ('paid', 'failed', 'refunded')),
  failure_reason text,
  attempt_count integer not null default 0,
  hosted_invoice_url text,
  created_at timestamptz not null default now()
);
create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_status_idx on public.payments (status, created_at desc);

alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

create policy "abonnement : lecture du sien" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "abonnement : lecture admin" on public.subscriptions
  for select to authenticated using ((select public.is_admin()));
create policy "paiement : lecture du sien" on public.payments
  for select to authenticated using (user_id = (select auth.uid()));
create policy "paiement : lecture admin" on public.payments
  for select to authenticated using ((select public.is_admin()));
-- Aucune politique d'écriture : seul le service role (webhook) écrit.

-- ---------------------------------------------------------------------
-- Parcelles
-- ---------------------------------------------------------------------
create table public.parcels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  crop text not null default '' check (char_length(crop) <= 80),
  area_ha numeric(10, 2) not null default 0 check (area_ha >= 0 and area_ha < 100000),
  created_at timestamptz not null default now()
);
create index parcels_user_idx on public.parcels (user_id);

-- Limite de parcelles de la formule gratuite, appliquée dans la base.
create or replace function public.enforce_parcel_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_plan text;
  parcel_count integer;
begin
  select plan into current_plan from public.profiles where id = new.user_id;
  if current_plan = 'free' then
    select count(*) into parcel_count from public.parcels where user_id = new.user_id;
    if parcel_count >= 5 then
      raise exception 'Limite de 5 parcelles atteinte avec la formule gratuite'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger parcels_limit before insert on public.parcels
  for each row execute function public.enforce_parcel_limit();

alter table public.parcels enable row level security;
create policy "parcelle : accès aux siennes" on public.parcels
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.is_active_member()));

-- ---------------------------------------------------------------------
-- Interventions (registre)
-- ---------------------------------------------------------------------
create table public.interventions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  parcel_id uuid not null references public.parcels (id) on delete cascade,
  done_on date not null default current_date,
  kind text not null check (kind in ('semis', 'traitement', 'fertilisation', 'travail_sol', 'recolte', 'autre')),
  product text not null default '' check (char_length(product) <= 120),
  dose numeric(12, 3) check (dose is null or dose >= 0),
  dose_unit text not null default '' check (char_length(dose_unit) <= 20),
  target text not null default '' check (char_length(target) <= 120),   -- cible du traitement
  operator text not null default '' check (char_length(operator) <= 80),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);
create index interventions_user_date_idx on public.interventions (user_id, done_on desc);

alter table public.interventions enable row level security;
create policy "intervention : accès aux siennes" on public.interventions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (select public.is_active_member())
    -- la parcelle doit appartenir au même exploitant
    and exists (select 1 from public.parcels p where p.id = parcel_id and p.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------
-- Fiches techniques (rédigées par Claude, validées par un humain)
-- ---------------------------------------------------------------------
create table public.tech_sheets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 2 and 160),
  category text not null check (category in ('machine', 'culture', 'produit', 'panne')),
  brand text not null default '',
  model text not null default '',
  summary text not null default '',
  cover_url text,
  content jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,   -- [{ "name", "path", "pages" }]
  status text not null default 'review'
    check (status in ('generating', 'review', 'validated', 'published', 'rejected')),
  ai_model text,
  validated_by uuid references public.profiles (id) on delete set null,
  validated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tech_sheets_status_idx on public.tech_sheets (status, category);

create trigger tech_sheets_touch before update on public.tech_sheets
  for each row execute function public.touch_updated_at();

alter table public.tech_sheets enable row level security;
create policy "fiche : lecture publique des fiches publiées" on public.tech_sheets
  for select to anon, authenticated using (status = 'published');
create policy "fiche : gestion admin" on public.tech_sheets
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- Parc matériel de l'exploitant
-- ---------------------------------------------------------------------
create table public.machines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  sheet_id uuid references public.tech_sheets (id) on delete set null,
  hours numeric(10, 1) not null default 0 check (hours >= 0),
  created_at timestamptz not null default now()
);
create index machines_user_idx on public.machines (user_id);

create table public.maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  machine_id uuid not null references public.machines (id) on delete cascade,
  operation text not null check (char_length(operation) between 1 and 160),
  done_at_hours numeric(10, 1) not null check (done_at_hours >= 0),
  done_on date not null default current_date,
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);
create index maintenance_machine_idx on public.maintenance_logs (machine_id, done_on desc);

alter table public.machines enable row level security;
alter table public.maintenance_logs enable row level security;

create policy "machine : accès aux siennes" on public.machines
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.is_active_member()));

create policy "entretien : accès aux siens" on public.maintenance_logs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (select public.is_active_member())
    and exists (select 1 from public.machines m where m.id = machine_id and m.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------
-- Blog
-- ---------------------------------------------------------------------
create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 2 and 200),
  excerpt text not null default '' check (char_length(excerpt) <= 400),
  content_md text not null default '',
  category text not null default 'materiel'
    check (category in ('reglementation', 'materiel', 'meteo-cultures', 'gestion')),
  cover_url text,
  author_name text not null default '',
  seo_description text not null default '' check (char_length(seo_description) <= 200),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index blog_posts_published_idx on public.blog_posts (status, published_at desc);

create trigger blog_posts_touch before update on public.blog_posts
  for each row execute function public.touch_updated_at();

alter table public.blog_posts enable row level security;
create policy "article : lecture publique" on public.blog_posts
  for select to anon, authenticated
  using (status in ('published', 'scheduled') and published_at is not null and published_at <= now());
create policy "article : gestion admin" on public.blog_posts
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- Journal d'activité (écrit uniquement par le serveur)
-- ---------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;
create policy "journal : lecture admin" on public.audit_log
  for select to authenticated using ((select public.is_admin()));
-- Pas de politique d'écriture : insertion par le service role uniquement.

-- ---------------------------------------------------------------------
-- Consommation de l'IA (limites par membre)
-- ---------------------------------------------------------------------
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  feature text not null check (feature in ('diagnostic', 'sheet_generation', 'sheet_revision')),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_user_idx on public.ai_usage (user_id, feature, created_at desc);

alter table public.ai_usage enable row level security;
create policy "ia : lecture de sa consommation" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));
create policy "ia : lecture admin" on public.ai_usage
  for select to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- Stockage des fichiers
--   media   : photos publiques (couvertures d'articles, photos de fiches)
--   sources : documents constructeurs privés utilisés par Claude
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('sources', 'sources', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy "media : écriture admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (select public.is_admin()));
create policy "media : suppression admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));
create policy "sources : lecture admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'sources' and (select public.is_admin()));
create policy "sources : écriture admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sources' and (select public.is_admin()));
