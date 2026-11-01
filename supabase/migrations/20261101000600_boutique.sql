-- =====================================================================
-- Boutique (vêtements et goodies imprimés et expédiés par Printful).
-- Réservée aux membres connectés ; livraison en France ; -10 % pour la
-- formule Complet. Le paiement passe par Stripe Checkout, la commande est
-- transmise à Printful par le webhook Stripe. Seul le serveur écrit ici.
-- =====================================================================

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  email text not null check (char_length(email) between 3 and 320),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'submitted', 'shipped', 'failed', 'canceled', 'refunded', 'abandoned')),
  -- Articles figés au moment de la commande : [{ sync_variant_id, variant_id, name, image, quantity, unit_cents, list_cents }].
  items jsonb not null,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  discount_label text,
  shipping_cents integer not null check (shipping_cents >= 0),
  shipping_method text not null default 'STANDARD',
  shipping_label text,
  total_cents integer not null check (total_cents >= 0),
  stripe_session_id text unique,
  stripe_payment_intent text,
  -- Adresse de livraison saisie dans le paiement Stripe.
  recipient jsonb,
  printful_order_id bigint,
  printful_status text,
  -- Colis expédiés : [{ carrier, service, number, url, shipped_at }].
  tracking jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  submitted_at timestamptz,
  shipped_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists shop_orders_user_idx on public.shop_orders (user_id, created_at desc);
create index if not exists shop_orders_status_idx on public.shop_orders (status, created_at desc);
create index if not exists shop_orders_pi_idx on public.shop_orders (stripe_payment_intent);

alter table public.shop_orders enable row level security;
create policy "boutique : chacun voit ses commandes" on public.shop_orders
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete on public.shop_orders from anon, authenticated;
