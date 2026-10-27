-- =====================================================================
-- Traitement automatique de la file d'import des fiches (à exécuter une fois
-- dans le SQL Editor de Supabase, après les migrations).
--
-- Chaque minute, s'il reste du travail, la base « réveille » le site, qui
-- traite une étape (recherche web, rédaction, ou nouvelle tentative de photo). Au plus 3 étapes tournent
-- en parallèle. (Adresse du site : https://tracteursandco.fr.)
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'sillon-catalogue',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://tracteursandco.fr/api/catalogue/tick',
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  )
  where exists (
    select 1 from public.catalog_models
    where status in ('queued', 'researched')
       or (status in ('researching', 'writing') and locked_at < now() - interval '8 minutes')
       -- Photos manquantes à retenter une fois (file au repos).
       or (status = 'done' and photo_status in ('none', 'error') and photo_retry_at is null and sheet_id is not null)
  );
  $$
);

-- Pour arrêter : select cron.unschedule('sillon-catalogue');

-- =====================================================================
-- Rappels d'entretien par e-mail : tous les matins vers 7 h (heure de Paris
-- en hiver ; 8 h en été). La route n'envoie qu'une tournée par jour.
-- =====================================================================
select cron.schedule(
  'tracteurs-rappels',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://tracteursandco.fr/api/e-mails/rappels',
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);

-- Pour arrêter : select cron.unschedule('tracteurs-rappels');
