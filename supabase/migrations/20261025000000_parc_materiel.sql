-- =====================================================================
-- Recentrage sur le machinisme agricole
--
-- 1. Suppression des parcelles, interventions (registre) et de la position
--    de l'exploitation (météo).
-- 2. Parc matériel complet : fiche machine enrichie, relevés de compteur,
--    dépenses, plan d'entretien personnalisé.
-- 3. Formule gratuite : 3 machines.
-- 4. Catégories du blog orientées matériel.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ce qui n'a plus sa place
-- ---------------------------------------------------------------------
drop table if exists public.interventions;
drop table if exists public.parcels;
drop function if exists private.enforce_parcel_limit();
alter table public.profiles drop column if exists latitude;
alter table public.profiles drop column if exists longitude;

-- ---------------------------------------------------------------------
-- 2. Machines
-- ---------------------------------------------------------------------
alter table public.machines
  add column kind text not null default 'tracteur'
    check (kind in ('tracteur', 'moissonneuse', 'telescopique', 'pulverisateur', 'automoteur', 'outil', 'autre')),
  add column brand text not null default '' check (char_length(brand) <= 60),
  add column model text not null default '' check (char_length(model) <= 80),
  add column year integer check (year between 1900 and 2100),
  add column serial_number text not null default '' check (char_length(serial_number) <= 60),
  add column registration text not null default '' check (char_length(registration) <= 20),
  -- Données économiques (coût de revient)
  add column purchase_date date,
  add column purchase_price numeric(12, 2) check (purchase_price >= 0),
  add column resale_value numeric(12, 2) check (resale_value >= 0),
  add column depreciation_years integer not null default 7 check (depreciation_years between 1 and 30),
  add column interest_rate numeric(5, 2) not null default 0 check (interest_rate between 0 and 30),
  add column annual_hours_estimate integer check (annual_hours_estimate between 1 and 8760),
  add column billing_rate numeric(10, 2) check (billing_rate >= 0),
  add column notes text not null default '' check (char_length(notes) <= 2000),
  add column updated_at timestamptz not null default now();

create trigger machines_touch before update on public.machines
  for each row execute function private.touch_updated_at();

-- Formule gratuite : 3 machines au plus, appliqué dans la base.
create function private.enforce_machine_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_plan text;
  machine_count integer;
begin
  select plan into current_plan from public.profiles where id = new.user_id;
  if current_plan = 'free' then
    select count(*) into machine_count from public.machines where user_id = new.user_id;
    if machine_count >= 3 then
      raise exception 'Limite de 3 machines atteinte avec la formule gratuite'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_machine_limit() from public, anon, authenticated;

create trigger machines_limit before insert on public.machines
  for each row execute function private.enforce_machine_limit();

-- ---------------------------------------------------------------------
-- Relevés de compteur (heures moteur) : base du calcul des heures annuelles.
-- ---------------------------------------------------------------------
create table public.hour_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  machine_id uuid not null references public.machines (id) on delete cascade,
  hours numeric(10, 1) not null check (hours >= 0 and hours < 1000000),
  read_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index hour_readings_machine_idx on public.hour_readings (machine_id, read_on desc);
create index hour_readings_user_idx on public.hour_readings (user_id);

-- ---------------------------------------------------------------------
-- Dépenses par machine (carburant, entretien, réparations…)
-- ---------------------------------------------------------------------
create table public.machine_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  machine_id uuid not null references public.machines (id) on delete cascade,
  kind text not null check (kind in ('carburant', 'entretien', 'reparation', 'pneumatiques', 'assurance', 'autre')),
  label text not null default '' check (char_length(label) <= 160),
  amount numeric(12, 2) not null check (amount >= 0 and amount < 10000000),   -- € HT
  liters numeric(10, 1) check (liters >= 0),
  hours_at numeric(10, 1) check (hours_at >= 0),
  spent_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index machine_costs_machine_idx on public.machine_costs (machine_id, spent_on desc);
create index machine_costs_user_idx on public.machine_costs (user_id);

-- ---------------------------------------------------------------------
-- Plan d'entretien personnalisé (en plus, ou à la place, de la fiche technique)
-- ---------------------------------------------------------------------
create table public.machine_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  machine_id uuid not null references public.machines (id) on delete cascade,
  operation text not null check (char_length(operation) between 1 and 160),
  interval_hours numeric(10, 1) check (interval_hours > 0),
  interval_months integer check (interval_months between 1 and 120),
  created_at timestamptz not null default now(),
  check (interval_hours is not null or interval_months is not null)
);
create index machine_tasks_machine_idx on public.machine_tasks (machine_id);
create index machine_tasks_user_idx on public.machine_tasks (user_id);

-- Entretiens notés : coût facultatif (repris dans les dépenses).
alter table public.maintenance_logs add column cost_id uuid references public.machine_costs (id) on delete set null;
create index maintenance_logs_cost_idx on public.maintenance_logs (cost_id);

-- Mêmes règles pour les trois tables : chacun ses lignes, sur ses propres machines,
-- et pas d'écriture pour un compte suspendu.
alter table public.hour_readings enable row level security;
alter table public.machine_costs enable row level security;
alter table public.machine_tasks enable row level security;

create policy "compteur : accès aux siens" on public.hour_readings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and exists (select 1 from public.machines m where m.id = machine_id and m.user_id = (select auth.uid()))
  );
create policy "dépense : accès aux siennes" on public.machine_costs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and exists (select 1 from public.machines m where m.id = machine_id and m.user_id = (select auth.uid()))
  );
create policy "plan d'entretien : accès aux siens" on public.machine_tasks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and exists (select 1 from public.machines m where m.id = machine_id and m.user_id = (select auth.uid()))
  );

revoke all on public.hour_readings, public.machine_costs, public.machine_tasks from anon;

-- ---------------------------------------------------------------------
-- 4. Blog : catégories du machinisme
-- ---------------------------------------------------------------------
alter table public.blog_posts drop constraint if exists blog_posts_category_check;
update public.blog_posts set category = 'materiel' where category = 'meteo-cultures';
alter table public.blog_posts add constraint blog_posts_category_check
  check (category in ('materiel', 'entretien', 'reglementation', 'gestion', 'occasion'));
