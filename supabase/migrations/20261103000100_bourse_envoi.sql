-- =====================================================================
-- Bourse au matériel, étape 3 : envoi automatique avec Boxtal.
-- Le vendeur donne le poids et le format du colis ; l'acheteur choisit
-- le transporteur (Mondial Relay, Colissimo, Chronopost…) au prix réel et
-- son point relais ; le bordereau et le suivi sont générés par Boxtal.
-- =====================================================================

-- Format du colis (dimensions types) pour calculer le port.
alter table public.listings add column if not exists parcel_size text
  check (parcel_size in ('petit', 'moyen', 'grand'));

-- Adresse d'expédition du vendeur, reprise d'un bordereau à l'autre.
alter table public.seller_accounts add column if not exists sender jsonb;

alter table public.listing_orders
  -- « boxtal » : bordereau automatique, port payé par la plateforme ;
  -- « vendeur » : le vendeur expédie lui-même et touche les frais de port.
  add column if not exists shipping_by text not null default 'vendeur' check (shipping_by in ('vendeur', 'boxtal')),
  -- Offre choisie par l'acheteur (code Boxtal, transporteur, prix…).
  add column if not exists shipping_offer jsonb,
  -- Point relais de livraison choisi par l'acheteur.
  add column if not exists pickup_point jsonb,
  -- Point de dépôt du vendeur (choisi automatiquement au plus près).
  add column if not exists dropoff_point jsonb,
  -- Poids et dimensions du colis.
  add column if not exists parcel jsonb,
  add column if not exists boxtal_order_id text unique,
  add column if not exists tracking_status text,
  add column if not exists delivered_at timestamptz;

create index if not exists listing_orders_boxtal_idx on public.listing_orders (shipping_by, status) where shipping_by = 'boxtal';
