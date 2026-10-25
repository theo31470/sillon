-- =====================================================================
-- E-mails : préférences des membres, journal des envois, campagnes admin
-- et suivi des rappels d'entretien déjà envoyés.
-- Toutes les écritures passent par le serveur (clé de service), sauf les
-- deux préférences que chaque membre peut changer sur son compte.
-- =====================================================================

-- Préférences d'envoi. Le jeton sert aux liens « se désinscrire » des
-- e-mails : il permet de changer ces deux préférences sans se connecter,
-- et rien d'autre.
alter table public.profiles
  add column if not exists email_reminders boolean not null default true,
  add column if not exists email_news boolean not null default true,
  add column if not exists email_token uuid not null default gen_random_uuid();

create unique index if not exists profiles_email_token_idx on public.profiles (email_token);

grant update (email_reminders, email_news) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- Campagnes envoyées depuis l'admin
-- ---------------------------------------------------------------------
create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (char_length(subject) between 1 and 150),
  body_md text not null check (char_length(body_md) between 1 and 20000),
  audience text not null check (audience in ('tous', 'gratuits', 'payants')),
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  recipients integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index email_campaigns_created_idx on public.email_campaigns (created_at desc);
create index email_campaigns_author_idx on public.email_campaigns (created_by);

-- ---------------------------------------------------------------------
-- Journal de tous les envois (compte, rappels, annonces)
-- ---------------------------------------------------------------------
create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  to_email text not null,
  kind text not null check (kind in ('compte', 'rappel', 'annonce', 'test')),
  template text not null,
  subject text not null,
  status text not null check (status in ('sent', 'failed')),
  provider_id text,
  error text,
  campaign_id uuid references public.email_campaigns (id) on delete set null,
  created_at timestamptz not null default now()
);
create index email_log_created_idx on public.email_log (created_at desc);
create index email_log_user_idx on public.email_log (user_id, created_at desc);
create index email_log_campaign_idx on public.email_log (campaign_id);

-- ---------------------------------------------------------------------
-- Rappels d'entretien déjà envoyés : une ligne par échéance et par niveau
-- (« bientôt » puis « en retard »), pour ne jamais prévenir deux fois.
-- Quand l'entretien est noté, l'échéance change, donc la clé aussi.
-- ---------------------------------------------------------------------
create table public.maintenance_reminders (
  machine_id uuid not null references public.machines (id) on delete cascade,
  operation_key text not null,
  due_key text not null,
  level text not null check (level in ('bientot', 'retard')),
  sent_at timestamptz not null default now(),
  primary key (machine_id, operation_key, due_key, level)
);

-- Une seule tournée de rappels par jour, même si la route est appelée
-- plusieurs fois.
create table public.reminder_runs (
  day date primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  users_checked integer not null default 0,
  emails_sent integer not null default 0
);

alter table public.email_campaigns enable row level security;
alter table public.email_log enable row level security;
alter table public.maintenance_reminders enable row level security;
alter table public.reminder_runs enable row level security;

create policy "campagnes : lecture admin" on public.email_campaigns
  for select to authenticated using ((select private.is_admin()));
create policy "envois : lecture admin" on public.email_log
  for select to authenticated using ((select private.is_admin()));
create policy "tournées : lecture admin" on public.reminder_runs
  for select to authenticated using ((select private.is_admin()));
-- maintenance_reminders : aucune politique, seul le serveur y accède.

revoke all on public.email_campaigns, public.email_log, public.maintenance_reminders, public.reminder_runs from anon;
revoke insert, update, delete on public.email_campaigns, public.email_log, public.maintenance_reminders, public.reminder_runs from authenticated;
