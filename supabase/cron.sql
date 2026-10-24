-- =====================================================================
-- Traitement automatique de la file d'import des fiches (à exécuter une fois
-- dans le SQL Editor de Supabase, après les migrations).
--
-- Chaque minute, s'il reste du travail, la base « réveille » le site, qui
-- traite une étape (recherche web ou rédaction). Au plus 3 étapes tournent
-- en parallèle. Remplacez l'adresse par celle de votre site.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'sillon-catalogue',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://sillon-five.vercel.app/api/catalogue/tick',
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  )
  where exists (
    select 1 from public.catalog_models
    where status in ('queued', 'researched')
       or (status in ('researching', 'writing') and locked_at < now() - interval '8 minutes')
  );
  $$
);

-- Pour arrêter : select cron.unschedule('sillon-catalogue');
