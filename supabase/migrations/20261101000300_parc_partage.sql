-- =====================================================================
-- Parc partagé : le titulaire d'une formule Complet invite jusqu'à deux
-- personnes (salarié, associé, mécanicien) sur son parc matériel.
--   « collaborateur » : voit les machines, note heures, entretiens et pannes ;
--   « lecture »       : voit les machines, leur carnet et leurs échéances.
-- Ni l'un ni l'autre ne voit les dépenses, ne modifie une machine, ne
-- supprime ce que le titulaire a saisi, ni ne gère l'abonnement.
-- L'accès cesse si le titulaire repasse en formule Gratuit ou est suspendu.
-- =====================================================================

create table if not exists public.fleet_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  member_id uuid references public.profiles (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  role text not null default 'collaborateur' check (role in ('collaborateur', 'lecture')),
  status text not null default 'invitation' check (status in ('invitation', 'actif')),
  -- Jeton du lien d'invitation (usage unique, effacé à l'acceptation).
  token uuid unique default gen_random_uuid(),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (member_id is null or member_id <> owner_id),
  check ((status = 'actif') = (member_id is not null))
);
create unique index if not exists fleet_members_email_idx on public.fleet_members (owner_id, lower(email));
create unique index if not exists fleet_members_member_idx on public.fleet_members (owner_id, member_id);
create index if not exists fleet_members_member_lookup_idx on public.fleet_members (member_id);

alter table public.fleet_members enable row level security;
create policy "parc partagé : le titulaire et l'invité voient l'accès" on public.fleet_members
  for select to authenticated using (owner_id = (select auth.uid()) or member_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete on public.fleet_members from anon, authenticated;

-- Rôle de la personne connectée sur le parc d'un titulaire : 'owner', 'collaborateur', 'lecture' ou null.
create or replace function private.fleet_role(p_owner uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_owner = (select auth.uid()) then 'owner'
    else (
      select fm.role
      from public.fleet_members fm
      join public.profiles o on o.id = fm.owner_id
      where fm.owner_id = p_owner
        and fm.member_id = (select auth.uid())
        and fm.status = 'actif'
        and o.plan <> 'free'
        and not o.suspended
    )
  end;
$$;
revoke all on function private.fleet_role(uuid) from public, anon;
grant execute on function private.fleet_role(uuid) to authenticated;

-- Machines : lecture pour les invités (l'écriture reste au titulaire).
create policy "machine : lecture par les invités du parc" on public.machines
  for select to authenticated using ((select private.fleet_role(user_id)) in ('collaborateur', 'lecture'));

-- Entretiens et relevés : le titulaire voit tout ce qui concerne ses machines (y compris
-- ce que ses collaborateurs ont noté) ; les invités lisent ; les collaborateurs ajoutent
-- et peuvent retirer leurs propres saisies.
alter policy "entretien : accès aux siens" on public.maintenance_logs
  using (exists (select 1 from public.machines m where m.id = machine_id and m.user_id = (select auth.uid())));
create policy "entretien : lecture par les invités du parc" on public.maintenance_logs
  for select to authenticated
  using (exists (select 1 from public.machines m where m.id = machine_id and (select private.fleet_role(m.user_id)) in ('collaborateur', 'lecture')));
create policy "entretien : ajout par les collaborateurs" on public.maintenance_logs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and cost_id is null
    and exists (select 1 from public.machines m where m.id = machine_id and (select private.fleet_role(m.user_id)) = 'collaborateur')
  );
create policy "entretien : retrait de ses saisies par les collaborateurs" on public.maintenance_logs
  for delete to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.machines m where m.id = machine_id and (select private.fleet_role(m.user_id)) = 'collaborateur'));

alter policy "compteur : accès aux siens" on public.hour_readings
  using (exists (select 1 from public.machines m where m.id = machine_id and m.user_id = (select auth.uid())));
create policy "compteur : lecture par les invités du parc" on public.hour_readings
  for select to authenticated
  using (exists (select 1 from public.machines m where m.id = machine_id and (select private.fleet_role(m.user_id)) in ('collaborateur', 'lecture')));
create policy "compteur : relevé par les collaborateurs" on public.hour_readings
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and exists (select 1 from public.machines m where m.id = machine_id and (select private.fleet_role(m.user_id)) = 'collaborateur')
  );

-- Plan d'entretien : lecture par les invités (échéances), modification par le titulaire seul.
create policy "plan d'entretien : lecture par les invités du parc" on public.machine_tasks
  for select to authenticated
  using (exists (select 1 from public.machines m where m.id = machine_id and (select private.fleet_role(m.user_id)) in ('collaborateur', 'lecture')));

-- Un relevé fait avancer le compteur de la machine (jamais reculer), quel qu'en soit l'auteur.
create or replace function private.bump_machine_hours()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.machines set hours = new.hours where id = new.machine_id and hours < new.hours;
  return new;
end;
$$;
revoke all on function private.bump_machine_hours() from public, anon, authenticated;
create trigger hour_readings_bump after insert on public.hour_readings
  for each row execute function private.bump_machine_hours();
