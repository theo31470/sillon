-- =====================================================================
-- Démo sans inscription : un compte d'exemple partagé, en lecture seule.
-- La base refuse toute écriture du compte de démonstration (comme pour un
-- compte suspendu) : les visiteurs regardent, ils ne peuvent rien modifier.
-- =====================================================================
alter table public.profiles add column if not exists is_demo boolean not null default false;
create unique index if not exists profiles_single_demo_idx on public.profiles (is_demo) where is_demo;

create or replace function private.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select not p.suspended and not p.is_demo from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;
