-- =====================================================================
-- Messages du formulaire de contact, lus et traités dans l'admin.
-- Écriture par le serveur uniquement (clé de service, après contrôles
-- anti-abus) ; lecture et mise à jour par les admins (double authentification).
-- =====================================================================

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  phone text not null default '' check (char_length(phone) <= 40),
  farm_name text not null default '' check (char_length(farm_name) <= 120),
  topic text not null default 'question'
    check (topic in ('question', 'abonnement', 'fiche', 'compte', 'partenariat', 'autre')),
  message text not null check (char_length(message) between 10 and 5000),
  user_id uuid references public.profiles (id) on delete set null,
  status text not null default 'nouveau' check (status in ('nouveau', 'en_cours', 'traite', 'archive')),
  admin_note text not null default '' check (char_length(admin_note) <= 5000),
  replies jsonb not null default '[]'::jsonb,            -- [{ at, by, subject, body }]
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references public.profiles (id) on delete set null
);

create index if not exists contact_messages_status_idx on public.contact_messages (status, created_at desc);
create index if not exists contact_messages_email_idx on public.contact_messages (lower(email), created_at desc);
create index if not exists contact_messages_user_idx on public.contact_messages (user_id);
create index if not exists contact_messages_handled_by_idx on public.contact_messages (handled_by);

alter table public.contact_messages enable row level security;
create policy "contact : lecture admin" on public.contact_messages
  for select to authenticated using ((select private.is_admin()));
-- Pas d'écriture depuis l'API publique : le serveur écrit avec la clé de service.

create trigger contact_messages_touch before update on public.contact_messages
  for each row execute function private.touch_updated_at();

-- E-mails liés au formulaire (accusé de réception, réponse de l'équipe).
alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('compte', 'rappel', 'annonce', 'test', 'facturation', 'message', 'contact'));
