-- =====================================================================
-- Réglages du site modifiables depuis l'admin (mode maintenance).
-- Lecture publique de la seule ligne « maintenance » (le proxy la lit avec
-- la clé publique) ; écriture uniquement par le serveur (clé de service).
-- =====================================================================
create table if not exists public.site_settings (
  key text primary key check (key in ('maintenance')),
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
create policy "réglages : lecture publique de l'état de maintenance" on public.site_settings
  for select to anon, authenticated using (key = 'maintenance');
insert into public.site_settings (key, value) values ('maintenance', '{"active": false}'::jsonb) on conflict (key) do nothing;
