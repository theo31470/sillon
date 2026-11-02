-- =====================================================================
-- Bourse au matériel, étape 2 : paiement sécurisé.
-- L'acheteur paie sur le site (prix + frais de port éventuels + frais de
-- service) ; l'argent reste chez Tracteurs & Co (Stripe) jusqu'à la remise
-- (code donné par l'acheteur) ou la réception du colis, puis il est versé
-- au vendeur sur son compte Stripe Connect. Seul le serveur écrit ici.
-- =====================================================================

-- Compte de versement du vendeur (Stripe Connect Express).
create table if not exists public.seller_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_account_id text not null unique,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  requirements_due text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.seller_accounts enable row level security;
create policy "versements : le vendeur voit son compte" on public.seller_accounts
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete on public.seller_accounts from anon, authenticated;

-- Frais de port fixés par le vendeur pour un envoi (avant les bordereaux automatiques).
alter table public.listings add column if not exists shipping_cents integer check (shipping_cents between 0 and 20000);

create table if not exists public.listing_orders (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  listing_id uuid references public.listings (id) on delete set null,
  buyer_id uuid references public.profiles (id) on delete set null,
  seller_id uuid references public.profiles (id) on delete set null,
  -- Annonce figée au moment de l'achat (titre, photo, prix).
  snapshot jsonb not null,
  mode text not null check (mode in ('envoi', 'main_propre')),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'shipped', 'completed', 'canceled', 'refunded', 'disputed', 'abandoned')),
  price_cents integer not null check (price_cents > 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  fee_cents integer not null check (fee_cents >= 0),
  total_cents integer not null check (total_cents > 0),
  stripe_payment_intent text unique,
  stripe_charge text,
  stripe_transfer text,
  -- Adresse de livraison (envoi) : visible par le vendeur une fois la commande payée.
  recipient jsonb,
  carrier text,
  tracking_number text,
  tracking_url text,
  dispute_reason text,
  admin_note text,
  paid_at timestamptz,
  shipped_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  -- Fonds versés automatiquement à cette date sans réclamation de l'acheteur.
  release_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists listing_orders_buyer_idx on public.listing_orders (buyer_id, created_at desc);
create index if not exists listing_orders_seller_idx on public.listing_orders (seller_id, created_at desc);
create index if not exists listing_orders_status_idx on public.listing_orders (status, release_at);
-- Une seule vente en cours par annonce.
create unique index if not exists listing_orders_active_idx on public.listing_orders (listing_id) where status in ('paid', 'shipped', 'disputed');

alter table public.listing_orders enable row level security;
create policy "achats : l'acheteur et le vendeur voient la transaction" on public.listing_orders
  for select to authenticated using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete on public.listing_orders from anon, authenticated;
