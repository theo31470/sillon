-- =====================================================================
-- Gestion des membres depuis l'admin
--  * accès offert à la formule Complet (sans Stripe), avec ou sans date de fin ;
--  * dernière activité ;
--  * fiche d'administration (notes internes, étiquettes, quota de diagnostics),
--    lisible des seuls admins ;
--  * liste filtrée et triée, appelée par le serveur avec la clé de service.
-- =====================================================================

alter table public.profiles
  add column if not exists comp_active boolean not null default false,
  add column if not exists comp_until timestamptz,
  add column if not exists last_seen_at timestamptz;

comment on column public.profiles.comp_active is 'Formule Complet offerte par un admin (hors Stripe).';
comment on column public.profiles.comp_until is 'Fin de la formule offerte (null : sans date de fin).';
comment on column public.profiles.last_seen_at is 'Dernière activité (connexion ou visite de l''espace membre).';

-- Dernière connexion recopiée depuis auth.users.
create or replace function private.handle_user_sign_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set last_seen_at = greatest(coalesce(last_seen_at, new.last_sign_in_at), new.last_sign_in_at)
   where id = new.id;
  return new;
end;
$$;
revoke all on function private.handle_user_sign_in() from public, anon, authenticated;

drop trigger if exists on_auth_user_signed_in on auth.users;
create trigger on_auth_user_signed_in
  after update of last_sign_in_at on auth.users
  for each row
  when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function private.handle_user_sign_in();

update public.profiles p
   set last_seen_at = u.last_sign_in_at
  from auth.users u
 where u.id = p.id and p.last_seen_at is null;

-- ---------------------------------------------------------------------
-- Fiche d'administration d'un membre (jamais visible du membre)
-- ---------------------------------------------------------------------
create table if not exists public.member_admin (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  note text not null default '' check (char_length(note) <= 5000),
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  diag_monthly_limit integer check (diag_monthly_limit between 0 and 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create index if not exists member_admin_tags_idx on public.member_admin using gin (tags);
create index if not exists member_admin_updated_by_idx on public.member_admin (updated_by);

alter table public.member_admin enable row level security;
create policy "fiche membre : lecture admin" on public.member_admin
  for select to authenticated using ((select private.is_admin()));
-- Écriture : clé de service uniquement (actions admin vérifiées côté serveur).

-- ---------------------------------------------------------------------
-- E-mails personnels envoyés depuis l'admin
-- ---------------------------------------------------------------------
alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('compte', 'rappel', 'annonce', 'test', 'facturation', 'message'));

-- ---------------------------------------------------------------------
-- Liste des membres pour l'admin (filtres, tri, nombre de machines).
-- Appelée uniquement par le serveur avec la clé de service, après
-- vérification des droits admin : aucun rôle de l'API publique n'y a accès.
-- ---------------------------------------------------------------------
create or replace function public.admin_member_list(
  p_q text default '',
  p_filtre text default 'tous',
  p_tag text default '',
  p_sort text default 'recent',
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  id uuid,
  email text,
  full_name text,
  farm_name text,
  role text,
  plan text,
  suspended boolean,
  comp_active boolean,
  comp_until timestamptz,
  created_at timestamptz,
  last_seen_at timestamptz,
  machine_count bigint,
  tags text[],
  sub_status text,
  sub_cancel_at_period_end boolean,
  total_count bigint
)
language sql
stable
set search_path = ''
as $$
  with base as (
    select
      p.*,
      (select count(*) from public.machines m where m.user_id = p.id) as machine_count,
      coalesce(ma.tags, '{}') as tags,
      s.status as sub_status,
      coalesce(s.cancel_at_period_end, false) as sub_cancel_at_period_end
    from public.profiles p
    left join public.member_admin ma on ma.user_id = p.id
    left join lateral (
      select s.status, s.cancel_at_period_end
        from public.subscriptions s
       where s.user_id = p.id
       order by (s.status in ('trialing', 'active', 'past_due', 'unpaid')) desc, s.created_at desc
       limit 1
    ) s on true
    where (coalesce(p_q, '') = ''
           or p.email ilike '%' || p_q || '%'
           or p.full_name ilike '%' || p_q || '%'
           or p.farm_name ilike '%' || p_q || '%')
      and (coalesce(p_tag, '') = '' or ma.tags @> array[p_tag])
  )
  select
    b.id, b.email, b.full_name, b.farm_name, b.role, b.plan, b.suspended,
    b.comp_active, b.comp_until, b.created_at, b.last_seen_at,
    b.machine_count, b.tags, b.sub_status, b.sub_cancel_at_period_end,
    count(*) over () as total_count
  from base b
  where case coalesce(p_filtre, 'tous')
    when 'payants'    then b.plan <> 'free' and not b.comp_active
    when 'gratuits'   then b.plan = 'free'
    when 'essai'      then b.sub_status = 'trialing'
    when 'resiliation' then b.sub_cancel_at_period_end and b.sub_status in ('trialing', 'active', 'past_due')
    when 'echec'      then b.sub_status in ('past_due', 'unpaid')
    when 'offerts'    then b.comp_active
    when 'inactifs'   then coalesce(b.last_seen_at, b.created_at) < now() - interval '30 days'
    when 'suspendus'  then b.suspended
    when 'admins'     then b.role = 'admin'
    else true
  end
  order by
    case when p_sort = 'ancien' then b.created_at end asc,
    case when p_sort = 'activite' then b.last_seen_at end desc nulls last,
    case when p_sort = 'machines' then b.machine_count end desc,
    case when p_sort = 'nom' then lower(coalesce(nullif(b.farm_name, ''), nullif(b.full_name, ''), b.email)) end asc,
    b.created_at desc
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 200);
$$;

revoke all on function public.admin_member_list(text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_member_list(text, text, text, text, integer, integer) to service_role;

-- Étiquettes déjà utilisées (suggestions dans l'admin).
create or replace function public.admin_member_tags()
returns table (tag text, n bigint)
language sql
stable
set search_path = ''
as $$
  select t, count(*) from public.member_admin, unnest(tags) as t group by t order by count(*) desc, t;
$$;
revoke all on function public.admin_member_tags() from public, anon, authenticated;
grant execute on function public.admin_member_tags() to service_role;
