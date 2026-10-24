-- =====================================================================
-- Photos des fiches : crédit obligatoire (auteur, licence, source).
-- Rempli automatiquement pour les photos libres (Wikimedia Commons),
-- et à la main pour une photo déposée par l'admin (photo presse autorisée…).
-- =====================================================================

alter table public.tech_sheets add column cover_credit jsonb
  check (cover_credit is null or (cover_credit ? 'author' and cover_credit ? 'license'));

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('diagnostic', 'sheet_generation', 'sheet_revision', 'sheet_research', 'catalog_listing', 'photo_selection'));

alter table public.catalog_models add column photo_status text
  check (photo_status in ('found', 'none', 'error'));
