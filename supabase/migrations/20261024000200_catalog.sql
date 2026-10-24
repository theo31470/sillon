-- =====================================================================
-- Catalogue des modèles et génération des fiches en série
--
-- L'admin fait lister par Claude les modèles d'une marque (recherche web),
-- coche ceux à rédiger, puis une file d'attente les traite un par un en
-- deux étapes : recherche des sources (researching → researched), puis
-- rédaction de la fiche (writing → done). Chaque étape tient dans la durée
-- maximale d'une fonction serveur.
-- =====================================================================

create table public.catalog_models (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (char_length(brand) between 1 and 60),
  series text not null default '' check (char_length(series) <= 120),
  model text not null check (char_length(model) between 1 and 120),
  years text not null default '' check (char_length(years) <= 40),
  power_hp integer check (power_hp between 1 and 2000),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  status text not null default 'todo'
    check (status in ('todo', 'queued', 'researching', 'researched', 'writing', 'done', 'error')),
  error text,
  research_notes text,
  research_sources jsonb not null default '[]'::jsonb,   -- [{ "name", "url" }]
  sheet_id uuid references public.tech_sheets (id) on delete set null,
  attempts integer not null default 0,
  queued_at timestamptz,
  locked_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un modèle n'apparaît qu'une fois par marque (sans tenir compte des majuscules).
create unique index catalog_models_unique on public.catalog_models (lower(brand), lower(model));
create index catalog_models_status_idx on public.catalog_models (status, queued_at);
create index catalog_models_sheet_idx on public.catalog_models (sheet_id);
create index catalog_models_created_by_idx on public.catalog_models (created_by);

create trigger catalog_models_touch before update on public.catalog_models
  for each row execute function private.touch_updated_at();

alter table public.catalog_models enable row level security;
create policy "catalogue : gestion admin" on public.catalog_models
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

revoke all on public.catalog_models from anon;

-- ---------------------------------------------------------------------
-- Prise d'une tâche dans la file (appelée côté serveur avec la clé secrète).
-- Priorité aux fiches déjà recherchées, pour terminer ce qui est commencé.
-- Les tâches bloquées depuis plus de 8 minutes sont reprises.
-- Au plus « max_active » étapes en parallèle (maîtrise des coûts et des quotas).
-- ---------------------------------------------------------------------
create function public.claim_catalog_job(max_active integer default 3)
returns setof public.catalog_models
language plpgsql
set search_path = ''
as $$
declare
  job_id uuid;
begin
  -- Un seul appel à la fois décide (évite de dépasser la limite en parallèle).
  perform pg_advisory_xact_lock(hashtext('sillon.catalog_claim'));

  update public.catalog_models
     set status = case
                    when attempts >= 6 then 'error'
                    when status = 'researching' then 'queued'
                    else 'researched'
                  end,
         error = case when attempts >= 6 then 'Trop de tentatives : relancez ce modèle.' else error end,
         locked_at = null
   where status in ('researching', 'writing')
     and locked_at < now() - interval '8 minutes';

  if (select count(*) from public.catalog_models where status in ('researching', 'writing')) >= max_active then
    return;
  end if;

  select id into job_id
    from public.catalog_models
   where status in ('researched', 'queued')
   order by (status = 'researched') desc, queued_at nulls last, created_at
   limit 1
   for update skip locked;

  if job_id is null then
    return;
  end if;

  return query
    update public.catalog_models
       set status = case status when 'queued' then 'researching' else 'writing' end,
           locked_at = now(),
           attempts = attempts + 1,
           error = null
     where id = job_id
    returning *;
end;
$$;

revoke all on function public.claim_catalog_job(integer) from public, anon, authenticated;
grant execute on function public.claim_catalog_job(integer) to service_role;

-- ---------------------------------------------------------------------
-- Suivi de la consommation : recherches web et nouvelles fonctions.
-- ---------------------------------------------------------------------
alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('diagnostic', 'sheet_generation', 'sheet_revision', 'sheet_research', 'catalog_listing'));
alter table public.ai_usage add column web_searches integer not null default 0;
alter table public.ai_usage add column web_fetches integer not null default 0;
