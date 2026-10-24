// Tests de sécurité de la base : lance un vrai Postgres local, applique la
// migration et vérifie les règles d'accès (RLS). Usage : npm run test:db
// (ne pas lancer en root : Postgres le refuse).
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';

const root = new URL('../supabase', import.meta.url).pathname;
const dbDir = new URL('../.db-test', import.meta.url).pathname;
fs.rmSync(dbDir, { recursive: true, force: true });

const server = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'pw', port: 54329, persistent: false });
await server.initialise();
await server.start();
const c = new pg.Client({ host: 'localhost', port: 54329, user: 'postgres', password: 'pw', database: 'postgres' });
await c.connect();

const stub = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub','')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb) $$;
grant usage on schema auth to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;
await c.query(stub);
for (const file of fs.readdirSync(`${root}/migrations`).filter((f) => f.endsWith('.sql')).sort()) {
  await c.query(fs.readFileSync(`${root}/migrations/${file}`, 'utf8'));
}
await c.query(fs.readFileSync(`${root}/seed.sql`, 'utf8'));
console.log('✓ migration + seed appliqués');

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const ADM = '33333333-3333-3333-3333-333333333333';
await c.query(`insert into auth.users (id,email,raw_user_meta_data) values
 ('${A}','a@x.fr','{"farm_name":"Ferme A"}'),('${B}','b@x.fr','{}'),('${ADM}','admin@x.fr','{}')`);
await c.query(`update public.profiles set role='admin' where id='${ADM}'`);

async function as(uid, aal, sql, params = []) {
  await c.query('begin');
  try {
    await c.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid, aal, role: 'authenticated' } : {})]);
    const r = await c.query(sql, params);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback');
    throw e;
  }
}
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) failures++; };
const throws = async (fn, msg) => { try { await fn(); ok(false, msg); } catch (e) { ok(true, `${msg} (${e.message.slice(0, 70)})`); } };

ok((await c.query('select count(*)::int n from public.profiles')).rows[0].n === 3, 'profils créés automatiquement à l’inscription');
const pA = await as(A, 'aal1', `insert into public.parcels (name, crop, area_ha) values ('Les Grès','Blé',4.2) returning id`);
const parcelA = pA.rows[0].id;
ok(true, 'A crée une parcelle');
ok((await as(B, 'aal1', 'select * from public.parcels')).rowCount === 0, 'B ne voit pas les parcelles de A');
await throws(() => as(B, 'aal1', `insert into public.interventions (parcel_id, kind) values ($1,'semis')`, [parcelA]), 'B ne peut pas noter une intervention sur la parcelle de A');
await as(A, 'aal1', `insert into public.interventions (parcel_id, kind, product) values ($1,'semis','Blé')`, [parcelA]);
ok((await as(A, 'aal1', 'select * from public.interventions')).rowCount === 1, 'A note une intervention sur sa parcelle');
ok((await as(B, 'aal1', `update public.interventions set notes='x'`)).rowCount === 0, 'B ne peut pas modifier les interventions de A');
await throws(() => as(A, 'aal1', `update public.profiles set role='admin' where id=$1`, [A]), 'A ne peut pas se donner le rôle admin');
await throws(() => as(A, 'aal1', `update public.profiles set plan='complet' where id=$1`, [A]), 'A ne peut pas changer sa formule lui-même');
ok((await as(A, 'aal1', `update public.profiles set farm_name='EARL A' where id=$1`, [A])).rowCount === 1, 'A peut modifier le nom de son exploitation');
for (let i = 0; i < 4; i++) await as(A, 'aal1', `insert into public.parcels (name) values ('P${i}')`);
await throws(() => as(A, 'aal1', `insert into public.parcels (name) values ('P6')`), 'formule gratuite : 6e parcelle refusée');
ok((await as(ADM, 'aal1', 'select * from public.profiles')).rowCount === 1, 'admin SANS double authentification : ne voit que son profil');
ok((await as(ADM, 'aal2', 'select * from public.profiles')).rowCount === 3, 'admin AVEC double authentification : voit tous les membres');
ok((await as(ADM, 'aal2', 'select * from public.parcels')).rowCount === 0, 'même l’admin ne lit pas les parcelles des exploitants');
ok((await as(null, null, 'select * from public.tech_sheets')).rowCount === 0, 'visiteur : fiche « à relire » invisible');
ok((await as(null, null, 'select * from public.blog_posts')).rowCount === 1, 'visiteur : article publié visible');
await throws(() => as(A, 'aal1', `insert into public.audit_log (action) values ('faux')`), 'un membre ne peut pas écrire dans le journal');
await throws(() => as(ADM, 'aal2', `insert into public.payments (id, amount_cents, status) values ('in_x', 100, 'paid')`), 'personne ne peut écrire un paiement hors webhook');
ok((await as(ADM, 'aal1', `update public.tech_sheets set status='published'`)).rowCount === 0, 'admin sans 2FA : ne peut pas publier une fiche');
ok((await as(ADM, 'aal2', `update public.tech_sheets set status='published'`)).rowCount === 1, 'admin avec 2FA : peut publier une fiche');
await c.query(`update public.profiles set suspended=true where id='${B}'`);
await throws(() => as(B, 'aal1', `insert into public.parcels (name) values ('X')`), 'compte suspendu : écriture refusée');

await throws(() => as(A, 'aal1', 'select private.handle_new_user()'), 'les fonctions internes ne sont pas appelables par un membre');
await throws(() => as(null, null, 'select private.is_admin()'), 'un visiteur ne peut pas appeler les fonctions de sécurité');
ok((await c.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef")).rows[0].n === 0, 'aucune fonction SECURITY DEFINER exposée dans le schéma public');

// Catalogue des modèles et file de génération
await c.query(`insert into public.catalog_models (brand, model, status, queued_at) values
  ('Fendt', '1050 Vario', 'queued', now() - interval '2 minutes'),
  ('Fendt', '942 Vario', 'researched', now() - interval '1 minute'),
  ('Claas', 'Axion 870', 'todo', null)`);
ok((await as(A, 'aal1', 'select * from public.catalog_models')).rowCount === 0, 'un membre ne voit pas le catalogue');
ok((await as(ADM, 'aal1', 'select * from public.catalog_models')).rowCount === 0, 'admin sans 2FA : catalogue invisible');
ok((await as(ADM, 'aal2', 'select * from public.catalog_models')).rowCount === 3, 'admin avec 2FA : voit le catalogue');
await throws(() => as(null, null, `insert into public.catalog_models (brand, model) values ('X', 'Y')`), 'un visiteur ne peut pas écrire dans le catalogue');
await throws(() => as(ADM, 'aal2', `insert into public.catalog_models (brand, model) values ('fendt', '1050 VARIO')`), 'doublon marque/modèle refusé (majuscules ignorées)');
await throws(() => as(ADM, 'aal2', 'select * from public.claim_catalog_job()'), 'la file n’est pilotable que côté serveur');
const first = (await c.query('select * from public.claim_catalog_job()')).rows[0];
ok(first?.model === '942 Vario' && first.status === 'writing', 'file : priorité aux fiches déjà recherchées');
ok((await c.query('select * from public.claim_catalog_job(1)')).rowCount === 0, 'file : nombre d’étapes en parallèle limité');
const second = (await c.query('select * from public.claim_catalog_job()')).rows[0];
ok(second?.model === '1050 Vario' && second.status === 'researching', 'file : puis les modèles en attente');
ok((await c.query('select * from public.claim_catalog_job()')).rowCount === 0, 'file vide : rien à prendre');
await c.query(`update public.catalog_models set locked_at = now() - interval '9 minutes' where model = '1050 Vario'`);
const resumed = (await c.query('select * from public.claim_catalog_job()')).rows[0];
ok(resumed?.model === '1050 Vario' && resumed.attempts === 2, 'file : une tâche bloquée est reprise');

await c.end();
await server.stop();
console.log(failures ? `\n${failures} test(s) en échec` : '\nTous les tests passent');
process.exit(failures ? 1 : 0);
