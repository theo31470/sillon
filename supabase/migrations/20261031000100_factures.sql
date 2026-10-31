-- =====================================================================
-- Facturation Tracteurs & Co : informations de facturation des membres,
-- factures et avoirs émis par le site (et non par Stripe).
--
-- Règles légales (micro-entreprise, France) :
--  - numérotation chronologique et continue, sans trou : un compteur par
--    série et par année, incrémenté dans la même transaction que la facture ;
--  - une facture émise ne se modifie ni ne se supprime (10 ans de conservation) :
--    une erreur se corrige par un avoir. Seul le lien vers le compte peut être
--    effacé (suppression du compte), les données de la facture restent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Informations de facturation (une ligne par membre)
-- ---------------------------------------------------------------------
create table if not exists public.billing_details (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 120),          -- nom ou raison sociale
  line1 text not null default '' check (char_length(line1) <= 200),
  line2 text not null default '' check (char_length(line2) <= 200),
  postal_code text not null default '' check (char_length(postal_code) <= 20),
  city text not null default '' check (char_length(city) <= 100),
  country text not null default 'FR' check (country ~ '^[A-Z]{2}$'),
  siret text not null default '' check (siret ~ '^([0-9]{14})?$'),
  vat_number text not null default '' check (char_length(vat_number) <= 20),
  updated_at timestamptz not null default now()
);

alter table public.billing_details enable row level security;
create policy "facturation : lecture des siennes" on public.billing_details
  for select to authenticated using (user_id = (select auth.uid()));
create policy "facturation : lecture admin" on public.billing_details
  for select to authenticated using ((select private.is_admin()));
-- Écriture par le serveur uniquement (après vérification de la session).

create trigger billing_details_touch before update on public.billing_details
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- Factures et avoirs
-- ---------------------------------------------------------------------
create table if not exists public.invoice_counters (
  series text primary key,               -- ex. FA-2026, AV-2026
  last_number integer not null default 0 check (last_number >= 0)
);
alter table public.invoice_counters enable row level security;
-- Aucune politique : seul le serveur (fonction issue_invoice) y touche.

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,                       -- FA-2026-00001 / AV-2026-00001
  kind text not null check (kind in ('facture', 'avoir')),
  user_id uuid references public.profiles (id) on delete set null,
  stripe_invoice_id text unique,                     -- facture : paiement Stripe correspondant
  stripe_refund_id text unique,                      -- avoir : remboursement Stripe correspondant
  credited_invoice_id uuid references public.invoices (id),
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  customer jsonb not null,                           -- copie figée : nom, adresse, SIRET, e-mail
  lines jsonb not null,                              -- [{ label, detail, quantity, unit_cents, total_cents }]
  total_cents integer not null check (total_cents >= 0),
  currency text not null default 'eur',
  payment_method text not null default '' check (char_length(payment_method) <= 120),
  constraint invoices_kind_refs check (
    (kind = 'facture' and stripe_invoice_id is not null and credited_invoice_id is null)
    or (kind = 'avoir' and stripe_refund_id is not null and credited_invoice_id is not null)
  )
);
create index if not exists invoices_user_idx on public.invoices (user_id, issued_at desc);
create index if not exists invoices_credited_idx on public.invoices (credited_invoice_id);

alter table public.invoices enable row level security;
create policy "factures : lecture des siennes" on public.invoices
  for select to authenticated using (user_id = (select auth.uid()));
create policy "factures : lecture admin" on public.invoices
  for select to authenticated using ((select private.is_admin()));

-- Une facture émise est figée.
create or replace function private.invoices_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Une facture émise ne peut pas être supprimée (émettez un avoir).';
  end if;
  -- Seul cas admis : le compte est supprimé, le lien vers le membre disparaît.
  if new.user_id is null and old.user_id is not null
     and (to_jsonb(new) - 'user_id') = (to_jsonb(old) - 'user_id') then
    return new;
  end if;
  raise exception 'Une facture émise ne peut pas être modifiée (émettez un avoir).';
end;
$$;
revoke all on function private.invoices_immutable() from public, anon, authenticated;

create trigger invoices_immutable before update or delete on public.invoices
  for each row execute function private.invoices_immutable();

-- Réservée au serveur (rôle service, qui contourne les règles RLS).
-- Émission atomique : numéro suivant de la série + facture, dans la même
-- transaction (pas de trou). Idempotente : un même paiement ou remboursement
-- Stripe ne donne jamais deux factures.
create or replace function public.issue_invoice(p jsonb)
returns public.invoices
language plpgsql
set search_path = ''
as $$
declare
  v_kind text := p->>'kind';
  v_issued timestamptz := coalesce((p->>'issued_at')::timestamptz, now());
  v_series text;
  v_next integer;
  v_row public.invoices;
begin
  if v_kind not in ('facture', 'avoir') then
    raise exception 'Type de facture inconnu : %', v_kind;
  end if;

  perform pg_advisory_xact_lock(hashtext('sillon.invoice.' || coalesce(p->>'stripe_invoice_id', p->>'stripe_refund_id', '')));

  select * into v_row from public.invoices
   where (v_kind = 'facture' and stripe_invoice_id = p->>'stripe_invoice_id')
      or (v_kind = 'avoir' and stripe_refund_id = p->>'stripe_refund_id');
  if found then
    return v_row;
  end if;

  v_series := (case v_kind when 'facture' then 'FA' else 'AV' end) || '-' || to_char(v_issued at time zone 'Europe/Paris', 'YYYY');
  insert into public.invoice_counters (series, last_number) values (v_series, 1)
    on conflict (series) do update set last_number = public.invoice_counters.last_number + 1
    returning last_number into v_next;

  insert into public.invoices (
    number, kind, user_id, stripe_invoice_id, stripe_refund_id, credited_invoice_id,
    issued_at, paid_at, customer, lines, total_cents, currency, payment_method
  ) values (
    v_series || '-' || lpad(v_next::text, 5, '0'),
    v_kind,
    nullif(p->>'user_id', '')::uuid,
    nullif(p->>'stripe_invoice_id', ''),
    nullif(p->>'stripe_refund_id', ''),
    nullif(p->>'credited_invoice_id', '')::uuid,
    v_issued,
    nullif(p->>'paid_at', '')::timestamptz,
    coalesce(p->'customer', '{}'::jsonb),
    coalesce(p->'lines', '[]'::jsonb),
    (p->>'total_cents')::integer,
    coalesce(nullif(p->>'currency', ''), 'eur'),
    coalesce(p->>'payment_method', '')
  )
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.issue_invoice(jsonb) from public, anon, authenticated;
grant execute on function public.issue_invoice(jsonb) to service_role;
