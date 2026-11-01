-- Lecture des factures d'atelier par Claude : consommation comptée dans ai_usage
-- (quota mensuel par membre, coût suivi dans l'admin).
alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('diagnostic', 'sheet_generation', 'sheet_revision', 'sheet_research', 'catalog_listing', 'photo_selection', 'invoice_reading'));
