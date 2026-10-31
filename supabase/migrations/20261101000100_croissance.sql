-- =====================================================================
-- Croissance : parrainage, demandes de fiches par les membres, relances.
-- Toutes les écritures passent par le serveur (clé de service) ; les
-- membres ne font que lire ce qui les concerne.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Parrainage
-- ---------------------------------------------------------------------
-- Code personnel, créé à la première ouverture de l'encart parrainage.
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles drop constraint if exists profiles_referral_code_check;
alter table public.profiles add constraint profiles_referral_code_check check (referral_code is null or referral_code ~ '^[A-Z0-9]{4,12}$');
create unique index if not exists profiles_referral_code_idx on public.profiles (referral_code);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  -- Un compte ne peut être parrainé qu'une fois.
  referee_id uuid not null unique references public.profiles (id) on delete cascade,
  status text not null default 'en_attente' check (status in ('en_attente', 'recompense', 'annule')),
  reward_cents integer not null default 0 check (reward_cents >= 0),
  stripe_balance_txn text,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  check (referrer_id <> referee_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id, created_at desc);

alter table public.referrals enable row level security;
drop policy if exists "parrainage : le parrain voit ses filleuls" on public.referrals;
create policy "parrainage : le parrain voit ses filleuls" on public.referrals
  for select to authenticated using (referrer_id = (select auth.uid()) or (select private.is_admin()));

-- ---------------------------------------------------------------------
-- Fiches demandées par les membres
-- ---------------------------------------------------------------------
create table if not exists public.sheet_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  brand text not null check (char_length(brand) between 1 and 60),
  model text not null check (char_length(model) between 1 and 120),
  details text not null default '' check (char_length(details) <= 300),
  status text not null default 'nouvelle' check (status in ('nouvelle', 'lancee', 'publiee', 'refusee')),
  catalog_model_id uuid references public.catalog_models (id) on delete set null,
  sheet_id uuid references public.tech_sheets (id) on delete set null,
  admin_note text not null default '' check (char_length(admin_note) <= 300),
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sheet_requests_unique on public.sheet_requests (user_id, lower(brand), lower(model));
create index if not exists sheet_requests_status_idx on public.sheet_requests (status, created_at);
create index if not exists sheet_requests_catalog_idx on public.sheet_requests (catalog_model_id);
create index if not exists sheet_requests_sheet_idx on public.sheet_requests (sheet_id);

drop trigger if exists sheet_requests_touch on public.sheet_requests;
create trigger sheet_requests_touch before update on public.sheet_requests
  for each row execute function private.touch_updated_at();

alter table public.sheet_requests enable row level security;
drop policy if exists "demande de fiche : lecture des siennes" on public.sheet_requests;
create policy "demande de fiche : lecture des siennes" on public.sheet_requests
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));

-- ---------------------------------------------------------------------
-- Relances envoyées aux comptes gratuits (une seule fois chacune)
-- ---------------------------------------------------------------------
create table if not exists public.member_nudges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('limite_machines', 'inactif')),
  sent_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.member_nudges enable row level security;
drop policy if exists "relances : lecture admin" on public.member_nudges;
create policy "relances : lecture admin" on public.member_nudges
  for select to authenticated using ((select private.is_admin()));
