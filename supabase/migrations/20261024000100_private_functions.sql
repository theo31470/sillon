-- =====================================================================
-- Durcissement (audit de sécurité Supabase)
-- Les fonctions « SECURITY DEFINER » ne doivent pas être appelables
-- via l'API publique (/rest/v1/rpc/...). On les déplace dans un schéma
-- « private » non exposé. Les règles RLS et les déclencheurs qui les
-- utilisent continuent de fonctionner (ils les référencent par identifiant).
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.is_admin() set schema private;
alter function public.is_active_member() set schema private;
alter function public.handle_new_user() set schema private;
alter function public.handle_user_email_change() set schema private;
alter function public.enforce_parcel_limit() set schema private;
alter function public.touch_updated_at() set schema private;

-- Les fonctions d'autorisation restent utilisables par les règles RLS
-- des utilisateurs connectés, et par personne d'autre.
revoke all on function private.is_admin() from public, anon;
revoke all on function private.is_active_member() from public, anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_active_member() to authenticated;

-- Les fonctions de déclencheur ne sont jamais appelées directement.
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.handle_user_email_change() from public, anon, authenticated;
revoke all on function private.enforce_parcel_limit() from public, anon, authenticated;
revoke all on function private.touch_updated_at() from public, anon, authenticated;

-- Index des clés étrangères (audit de performance)
create index if not exists audit_log_actor_idx on public.audit_log (actor_id);
create index if not exists interventions_parcel_idx on public.interventions (parcel_id);
create index if not exists machines_sheet_idx on public.machines (sheet_id);
create index if not exists maintenance_user_idx on public.maintenance_logs (user_id);
create index if not exists tech_sheets_validated_by_idx on public.tech_sheets (validated_by);
