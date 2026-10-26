-- Nouvelle tentative de photo (une seule) pour les fiches importées restées sans photo :
-- faite quand la file d'import est au repos, en réutilisant d'abord la photo d'un
-- modèle de la même série.
alter table public.catalog_models add column if not exists photo_retry_at timestamptz;
