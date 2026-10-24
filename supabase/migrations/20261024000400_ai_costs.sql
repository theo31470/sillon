-- =====================================================================
-- Maîtrise des coûts de l'IA
--  - chaque appel enregistre le modèle utilisé et son coût estimé (USD) ;
--  - la file d'import ne lance pas deux recherches sur la même série en
--    parallèle : la recherche est faite une fois par série, puis réutilisée
--    pour chaque modèle de la série.
-- =====================================================================

alter table public.ai_usage add column model text;
alter table public.ai_usage add column cost_usd numeric(10, 5) not null default 0;
create index ai_usage_created_idx on public.ai_usage (created_at desc);

-- Coût des appels déjà faits (tous passés par Sonnet 5.5 : 2 $ / 10 $ par million de tokens, 0,01 $ par recherche).
update public.ai_usage
   set model = 'claude-sonnet-5-5',
       cost_usd = round((input_tokens * 2.0 + output_tokens * 10.0) / 1000000 + web_searches * 0.01, 5)
 where model is null;

create or replace function public.claim_catalog_job(max_active integer default 3)
returns setof public.catalog_models
language plpgsql
set search_path = ''
as $$
declare
  job_id uuid;
begin
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

  select c.id into job_id
    from public.catalog_models c
   where c.status in ('researched', 'queued')
     -- Une seule recherche à la fois par série : les autres modèles attendent et la réutiliseront.
     and not (
       c.status = 'queued' and c.series <> '' and exists (
         select 1 from public.catalog_models o
          where o.id <> c.id and lower(o.brand) = lower(c.brand) and o.series = c.series and o.status = 'researching'
       )
     )
   order by (c.status = 'researched') desc, c.queued_at nulls last, c.created_at
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
