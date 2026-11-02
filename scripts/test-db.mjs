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
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, last_sign_in_at timestamptz);
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
const mA = await as(A, 'aal1', `insert into public.machines (name, kind, brand, model, hours) values ('Le gros vert','tracteur','Fendt','724 Vario',1200) returning id`);
const machineA = mA.rows[0].id;
ok(true, 'A ajoute une machine');
ok((await as(B, 'aal1', 'select * from public.machines')).rowCount === 0, 'B ne voit pas les machines de A');
await throws(() => as(B, 'aal1', `insert into public.machine_costs (machine_id, kind, amount) values ($1,'carburant',100)`, [machineA]), 'B ne peut pas ajouter une dépense sur la machine de A');
await throws(() => as(B, 'aal1', `insert into public.hour_readings (machine_id, hours) values ($1, 1300)`, [machineA]), 'B ne peut pas relever le compteur de la machine de A');
await throws(() => as(B, 'aal1', `insert into public.maintenance_logs (machine_id, operation, done_at_hours) values ($1,'Vidange',1200)`, [machineA]), 'B ne peut pas noter un entretien sur la machine de A');
await as(A, 'aal1', `insert into public.machine_costs (machine_id, kind, amount, liters) values ($1,'carburant',180.5,120)`, [machineA]);
await as(A, 'aal1', `insert into public.hour_readings (machine_id, hours) values ($1, 1210)`, [machineA]);
await as(A, 'aal1', `insert into public.machine_tasks (machine_id, operation, interval_hours) values ($1,'Graissage',50)`, [machineA]);
ok((await as(A, 'aal1', 'select * from public.machine_costs')).rowCount === 1, 'A note une dépense sur sa machine');
ok((await as(B, 'aal1', `update public.machine_costs set amount = 0`)).rowCount === 0, 'B ne peut pas modifier les dépenses de A');
ok((await as(B, 'aal1', 'select * from public.machine_tasks')).rowCount === 0, 'B ne voit pas le plan d’entretien de A');
await throws(() => as(A, 'aal1', `insert into public.machine_tasks (machine_id, operation) values ($1,'Sans intervalle')`, [machineA]), 'plan d’entretien : un intervalle est obligatoire');
await throws(() => as(A, 'aal1', `update public.profiles set role='admin' where id=$1`, [A]), 'A ne peut pas se donner le rôle admin');
await throws(() => as(A, 'aal1', `update public.profiles set plan='complet' where id=$1`, [A]), 'A ne peut pas changer sa formule lui-même');
ok((await as(A, 'aal1', `update public.profiles set farm_name='EARL A' where id=$1`, [A])).rowCount === 1, 'A peut modifier le nom de son exploitation');
for (let i = 0; i < 2; i++) await as(A, 'aal1', `insert into public.machines (name) values ('M${i}')`);
await throws(() => as(A, 'aal1', `insert into public.machines (name) values ('M4')`), 'formule gratuite : 4e machine refusée');
ok((await as(ADM, 'aal1', 'select * from public.profiles')).rowCount === 1, 'admin SANS double authentification : ne voit que son profil');
ok((await as(ADM, 'aal2', 'select * from public.profiles')).rowCount === 3, 'admin AVEC double authentification : voit tous les membres');
ok((await as(ADM, 'aal2', 'select * from public.machine_costs')).rowCount === 0, 'même l’admin ne lit pas les dépenses des exploitants');
ok((await as(null, null, 'select * from public.tech_sheets')).rowCount === 0, 'visiteur : fiche « à relire » invisible');
ok((await as(null, null, 'select * from public.blog_posts')).rowCount === 1, 'visiteur : article publié visible');
await throws(() => as(A, 'aal1', `insert into public.audit_log (action) values ('faux')`), 'un membre ne peut pas écrire dans le journal');
await throws(() => as(ADM, 'aal2', `insert into public.payments (id, amount_cents, status) values ('in_x', 100, 'paid')`), 'personne ne peut écrire un paiement hors webhook');
ok((await as(ADM, 'aal1', `update public.tech_sheets set status='published'`)).rowCount === 0, 'admin sans 2FA : ne peut pas publier une fiche');
ok((await as(ADM, 'aal2', `update public.tech_sheets set status='published'`)).rowCount === 1, 'admin avec 2FA : peut publier une fiche');
await c.query(`update public.profiles set suspended=true where id='${B}'`);
await throws(() => as(B, 'aal1', `insert into public.machines (name) values ('X')`), 'compte suspendu : écriture refusée');

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

// Une seule recherche à la fois par série
await c.query(`delete from public.catalog_models`);
await c.query(`insert into public.catalog_models (brand, series, model, status, queued_at, locked_at) values
  ('Fendt', '700 Vario', '720 Vario', 'researching', now(), now()),
  ('Fendt', '700 Vario', '722 Vario', 'queued', now() - interval '3 minutes', null),
  ('Fendt', '900 Vario', '930 Vario', 'queued', now() - interval '1 minute', null)`);
const nextSeries = (await c.query('select * from public.claim_catalog_job()')).rows[0];
ok(nextSeries?.model === '930 Vario', 'file : pas deux recherches en parallèle sur la même série');

// E-mails : préférences, journal, campagnes, rappels
const tokA = (await c.query('select email_token from public.profiles where id = $1', [A])).rows[0].email_token;
ok(Boolean(tokA), 'chaque profil reçoit un jeton de désinscription');
ok((await as(A, 'aal1', 'update public.profiles set email_reminders = false, email_news = false where id = $1', [A])).rowCount === 1, 'A coupe ses rappels et annonces');
await throws(() => as(A, 'aal1', `update public.profiles set email_token = gen_random_uuid() where id = $1`, [A]), 'A ne peut pas changer son jeton de désinscription');
ok((await as(A, 'aal1', 'update public.profiles set email_news = true where id = $1', [B])).rowCount === 0, 'A ne peut pas changer les préférences de B');
await c.query(`insert into public.email_log (user_id, to_email, kind, template, subject, status) values ($1, 'a@x.fr', 'rappel', 'rappel_entretien', 'Vidange', 'sent')`, [A]);
await c.query(`insert into public.email_campaigns (subject, body_md, audience) values ('Annonce', 'Bonjour à tous', 'tous')`);
await c.query(`insert into public.maintenance_reminders (machine_id, operation_key, due_key, level) values ($1, 'vidange', '1500|', 'bientot')`, [machineA]);
await c.query(`insert into public.reminder_runs (day) values (current_date)`);
for (const t of ['email_log', 'email_campaigns', 'maintenance_reminders', 'reminder_runs']) {
  ok((await as(A, 'aal1', `select * from public.${t}`)).rowCount === 0, `un membre ne lit pas ${t}`);
  await throws(() => as(A, 'aal1', `delete from public.${t}`).then((r) => { if (r.rowCount === 0) throw new Error('aucune ligne'); }), `un membre ne peut rien effacer dans ${t}`);
  await throws(() => as(null, null, `select * from public.${t}`), `un visiteur ne lit pas ${t}`);
}
ok((await as(ADM, 'aal2', 'select * from public.email_log')).rowCount === 1, 'admin avec 2FA : voit le journal des envois');
ok((await as(ADM, 'aal1', 'select * from public.email_log')).rowCount === 0, 'admin sans 2FA : journal des envois invisible');
ok((await as(ADM, 'aal2', 'select * from public.maintenance_reminders')).rowCount === 0, 'suivi des rappels : réservé au serveur, même pour l’admin');
await throws(() => c.query(`insert into public.reminder_runs (day) values (current_date)`), 'une seule tournée de rappels par jour');
await c.query(`delete from public.machines where id = $1`, [machineA]);
ok((await c.query('select count(*)::int n from public.maintenance_reminders')).rows[0].n === 0, 'machine supprimée : ses rappels envoyés partent avec');

// Gestion des membres (admin)
await c.query(`update auth.users set last_sign_in_at = now() where id = $1`, [A]);
ok((await c.query('select last_seen_at from public.profiles where id = $1', [A])).rows[0].last_seen_at !== null, 'connexion : dernière activité recopiée sur le profil');
await c.query(`insert into public.member_admin (user_id, note, tags, diag_monthly_limit) values ($1, 'Client fidèle', '{cuma}', 50)`, [A]);
ok((await as(A, 'aal1', 'select * from public.member_admin')).rowCount === 0, 'un membre ne lit pas sa fiche d’administration (notes internes)');
await throws(() => as(A, 'aal1', `insert into public.member_admin (user_id, note) values ($1, 'x')`, [B]).then((r) => { if (!r.rowCount) throw new Error('refusé'); }), 'un membre ne peut pas écrire de note');
ok((await as(ADM, 'aal1', 'select * from public.member_admin')).rowCount === 0, 'admin sans 2FA : notes invisibles');
ok((await as(ADM, 'aal2', 'select * from public.member_admin')).rowCount === 1, 'admin avec 2FA : lit les notes');
await throws(() => as(A, 'aal1', `update public.profiles set comp_active = true where id = $1`, [A]), 'un membre ne peut pas s’offrir la formule Complet');
await throws(() => as(ADM, 'aal2', `select * from public.admin_member_list()`), 'la liste admin n’est pas appelable depuis l’API publique');
await c.query('set role service_role');
const list = (await c.query(`select * from public.admin_member_list('', 'tous', '', 'recent', 0, 25)`)).rows;
const tagged = (await c.query(`select * from public.admin_member_list('', 'tous', 'cuma', 'recent', 0, 25)`)).rows;
const suspendedList = (await c.query(`select * from public.admin_member_list('', 'suspendus', '', 'recent', 0, 25)`)).rows;
const searchList = (await c.query(`select * from public.admin_member_list('earl', 'tous', '', 'nom', 0, 25)`)).rows;
const tags = (await c.query(`select * from public.admin_member_tags()`)).rows;
await c.query('reset role');
ok(list.length === 3 && Number(list[0].total_count) === 3, 'liste admin : tous les membres, avec le total');
ok(tagged.length === 1 && tagged[0].id === A, 'liste admin : filtre par étiquette');
ok(suspendedList.length === 1 && suspendedList[0].id === B, 'liste admin : filtre « suspendus »');
ok(searchList.length >= 1 && searchList.every((r) => /earl/i.test(r.farm_name + r.full_name + r.email)) , 'liste admin : recherche');
ok(tags[0]?.tag === 'cuma', 'étiquettes utilisées : suggestions');
await c.query(`insert into public.email_log (user_id, to_email, kind, template, subject, status) values ($1, 'a@x.fr', 'message', 'message_admin', 'Bonjour', 'sent')`, [A]);
ok(true, 'journal des e-mails : type « message » accepté');

// Formulaire de contact
await c.query(`insert into public.contact_messages (name, email, topic, message) values ('Jean', 'jean@x.fr', 'question', 'Bonjour, une question sur les rappels.')`);
ok((await as(A, 'aal1', 'select * from public.contact_messages')).rowCount === 0, 'un membre ne lit pas les messages de contact');
ok((await as(null, null, 'select * from public.contact_messages').catch(() => ({ rowCount: 0 }))).rowCount === 0, 'un visiteur ne lit pas les messages de contact');
await throws(() => as(null, null, `insert into public.contact_messages (name, email, message) values ('X', 'x@x.fr', 'message de spam direct')`), 'un visiteur ne peut pas écrire directement un message (passage obligé par le serveur)');
await throws(() => as(A, 'aal1', `insert into public.contact_messages (name, email, message) values ('X', 'x@x.fr', 'message de spam direct')`), 'un membre non plus');
ok((await as(ADM, 'aal1', 'select * from public.contact_messages')).rowCount === 0, 'admin sans 2FA : messages invisibles');
ok((await as(ADM, 'aal2', 'select * from public.contact_messages')).rowCount === 1, 'admin avec 2FA : lit les messages');
ok((await as(ADM, 'aal2', `update public.contact_messages set status = 'traite'`)).rowCount === 0, 'même l’admin ne modifie un message que via le serveur');
await throws(() => c.query(`insert into public.contact_messages (name, email, topic, message) values ('J', 'j@x.fr', 'spam', 'Un sujet qui n’existe pas.')`), 'sujet de message contrôlé');

// --- Facturation : informations, factures et avoirs ---
await c.query(`insert into public.billing_details (user_id, name, line1, postal_code, city, siret) values ('${A}', 'EARL A', '1 route du Moulin', '34000', 'Montpellier', '12345678901234')`);
ok((await as(A, 'aal1', 'select * from public.billing_details')).rowCount === 1, 'A lit ses informations de facturation');
ok((await as(B, 'aal1', 'select * from public.billing_details')).rowCount === 0, 'B ne voit pas celles de A');
ok((await as(A, 'aal1', `update public.billing_details set siret = '99999999999999'`)).rowCount === 0, 'un membre ne modifie pas sa fiche de facturation en direct (passage par le serveur)');
await throws(() => c.query(`update public.billing_details set siret = '123' where user_id = '${A}'`), 'SIRET : 14 chiffres exigés');
await throws(() => as(A, 'aal1', `select public.issue_invoice('{"kind":"facture","stripe_invoice_id":"in_x","total_cents":699,"customer":{},"lines":[]}'::jsonb)`), 'un membre ne peut pas émettre de facture');
const svc = async (p) => { await c.query('set role service_role'); try { return (await c.query('select * from public.issue_invoice($1::jsonb)', [JSON.stringify(p)])).rows[0]; } finally { await c.query('reset role'); } };
const f1 = await svc({ kind: 'facture', user_id: A, stripe_invoice_id: 'in_1', total_cents: 699, customer: { name: 'EARL A' }, lines: [{ label: 'Formule Complet', total_cents: 699 }] });
const f2 = await svc({ kind: 'facture', user_id: A, stripe_invoice_id: 'in_2', total_cents: 6900, customer: { name: 'EARL A' }, lines: [] });
const f1bis = await svc({ kind: 'facture', user_id: A, stripe_invoice_id: 'in_1', total_cents: 699, customer: {}, lines: [] });
const year = new Date().toLocaleDateString('fr-FR', { year: 'numeric', timeZone: 'Europe/Paris' });
ok(f1.number === `FA-${year}-00001` && f2.number === `FA-${year}-00002`, `numérotation continue (${f1.number}, ${f2.number})`);
ok(f1bis.id === f1.id, 'même paiement Stripe : la même facture, pas de doublon ni de numéro perdu');
const av = await svc({ kind: 'avoir', user_id: A, stripe_refund_id: 're_1', credited_invoice_id: f1.id, total_cents: 699, customer: { name: 'EARL A' }, lines: [] });
ok(av.number === `AV-${year}-00001`, `avoir dans sa propre série (${av.number})`);
await throws(() => svc({ kind: 'avoir', user_id: A, stripe_refund_id: 're_2', total_cents: 1, customer: {}, lines: [] }), 'un avoir doit viser une facture');
ok((await c.query(`select last_number from public.invoice_counters where series = 'FA-${year}'`)).rows[0].last_number === 2, 'l’échec d’un avoir ne consomme aucun numéro de facture');
await throws(() => c.query(`update public.invoices set total_cents = 1 where id = '${f1.id}'`), 'une facture émise ne se modifie pas');
await throws(() => c.query(`delete from public.invoices where id = '${f2.id}'`), 'une facture émise ne se supprime pas');
ok((await as(A, 'aal1', 'select * from public.invoices')).rowCount === 3, 'A voit ses factures et avoirs');
ok((await as(B, 'aal1', 'select * from public.invoices')).rowCount === 0, 'B ne voit pas les factures de A');
ok((await as(ADM, 'aal2', 'select * from public.invoices')).rowCount === 3, 'l’admin (2FA) voit toutes les factures');
await c.query(`update public.invoices set user_id = null where user_id = '${A}'`);
ok((await c.query(`select count(*)::int n from public.invoices where user_id is null`)).rows[0].n === 3, 'compte supprimé : les factures restent (obligation légale), sans lien vers le compte');

// --- Parrainage, demandes de fiches, relances ---
await throws(() => as(A, 'aal1', `update public.profiles set referral_code = 'TRICHE' where id = $1`, [A]), 'un membre ne choisit pas son code de parrainage');
await c.query(`update public.profiles set referral_code = 'ABC234' where id = '${A}'`);
await throws(() => c.query(`update public.profiles set referral_code = 'ABC234' where id = '${B}'`), 'code de parrainage unique');
await throws(() => c.query(`update public.profiles set referral_code = 'abc' where id = '${B}'`), 'code de parrainage : format vérifié');
await c.query(`insert into public.referrals (referrer_id, referee_id) values ('${A}', '${B}')`);
await throws(() => c.query(`insert into public.referrals (referrer_id, referee_id) values ('${ADM}', '${B}')`), 'un compte n’est parrainé qu’une fois');
await throws(() => c.query(`insert into public.referrals (referrer_id, referee_id) values ('${A}', '${A}')`), 'pas d’auto-parrainage');
ok((await as(A, 'aal1', 'select * from public.referrals')).rowCount === 1, 'le parrain voit ses filleuls');
ok((await as(B, 'aal1', 'select * from public.referrals')).rowCount === 0, 'le filleul ne voit pas la fiche de parrainage');
await throws(() => as(A, 'aal1', `insert into public.referrals (referrer_id, referee_id) values ('${A}', '${ADM}')`), 'un membre ne crée pas de parrainage lui-même');
ok((await as(A, 'aal1', `update public.referrals set status = 'recompense'`)).rowCount === 0, 'un membre ne se crédite pas une récompense');
await throws(() => as(A, 'aal1', `insert into public.sheet_requests (user_id, brand, model) values ('${A}', 'Fendt', '312')`), 'une demande de fiche passe par le serveur');
await c.query(`insert into public.sheet_requests (user_id, brand, model) values ('${A}', 'Fendt', '312')`);
await throws(() => c.query(`insert into public.sheet_requests (user_id, brand, model) values ('${A}', 'FENDT', '312')`), 'une seule demande par membre et par modèle');
ok((await as(A, 'aal1', 'select * from public.sheet_requests')).rowCount === 1, 'A voit ses demandes de fiches');
ok((await as(B, 'aal1', 'select * from public.sheet_requests')).rowCount === 0, 'B ne voit pas les demandes de A');
ok((await as(ADM, 'aal2', 'select * from public.sheet_requests')).rowCount === 1, 'l’admin (2FA) voit les demandes');
ok((await as(A, 'aal1', `update public.sheet_requests set status = 'publiee'`)).rowCount === 0, 'un membre ne change pas le statut de sa demande');
await c.query(`insert into public.member_nudges (user_id, kind) values ('${A}', 'inactif')`);
await throws(() => c.query(`insert into public.member_nudges (user_id, kind) values ('${A}', 'inactif')`), 'une relance n’est envoyée qu’une fois');
ok((await as(A, 'aal1', 'select * from public.member_nudges')).rowCount === 0, 'un membre ne lit pas le suivi des relances');

// --- Mode maintenance ---
ok((await as(null, null, `select value->>'active' a from public.site_settings where key = 'maintenance'`)).rows[0]?.a === 'false', 'visiteur : lit l’état de maintenance');
ok((await as(ADM, 'aal2', `update public.site_settings set value = '{"active": true}'`)).rowCount === 0, 'le mode maintenance ne se change que par le serveur');
await throws(() => as(A, 'aal1', `insert into public.site_settings (key, value) values ('maintenance', '{}')`), 'un membre ne crée pas de réglage');
await throws(() => c.query(`insert into public.site_settings (key) values ('autre')`), 'seules les clés prévues sont acceptées');

// --- Parc partagé ---
const C3 = '44444444-4444-4444-4444-444444444444';
await c.query(`insert into auth.users (id, email, raw_user_meta_data) values ('${C3}', 'meca@x.fr', '{}')`);
await c.query(`update public.profiles set plan = 'complet' where id = '${A}'`);
await c.query(`insert into public.fleet_members (owner_id, member_id, email, role, status, token) values ('${A}', '${C3}', 'meca@x.fr', 'collaborateur', 'actif', null)`);
await throws(() => as(C3, 'aal1', `insert into public.fleet_members (owner_id, member_id, email, status) values ('${C3}', '${A}', 'a@x.fr', 'actif')`), 'un membre ne s’ajoute pas lui-même à un parc');
const nA = (await c.query(`select count(*)::int n from public.machines where user_id = '${A}'`)).rows[0].n;
const mShared = (await c.query(`select id from public.machines where user_id = '${A}' limit 1`)).rows[0].id;
await as(A, 'aal1', `insert into public.machine_tasks (machine_id, operation, interval_hours) values ($1, 'Graissage', 50)`, [mShared]);
ok((await as(C3, 'aal1', `select id from public.machines`)).rowCount === nA, 'collaborateur : voit les machines du parc partagé');
ok((await as(C3, 'aal1', `update public.machines set name = 'Piraté'`)).rowCount === 0, 'collaborateur : ne modifie pas les machines');
ok((await as(C3, 'aal1', `delete from public.machines`)).rowCount === 0, 'collaborateur : ne supprime pas de machine');
ok((await as(C3, 'aal1', `select * from public.machine_costs`)).rowCount === 0, 'collaborateur : ne voit pas les dépenses');
ok((await as(C3, 'aal1', `select * from public.machine_tasks`)).rowCount >= 1, 'collaborateur : voit le plan d’entretien (échéances)');
await as(C3, 'aal1', `insert into public.maintenance_logs (machine_id, operation, done_at_hours) values ($1, 'Graissage', 1500)`, [mShared]);
ok(true, 'collaborateur : note un entretien');
await throws(() => as(C3, 'aal1', `insert into public.machine_costs (machine_id, kind, amount) values ($1, 'entretien', 10)`, [mShared]), 'collaborateur : ne saisit pas de dépense');
ok((await as(A, 'aal1', `select * from public.maintenance_logs where operation = 'Graissage'`)).rowCount === 1, 'titulaire : voit l’entretien noté par son collaborateur');
ok((await as(C3, 'aal1', `delete from public.maintenance_logs where operation <> 'Graissage'`)).rowCount === 0, 'collaborateur : ne retire pas les saisies du titulaire');
await as(C3, 'aal1', `insert into public.hour_readings (machine_id, hours) values ($1, 1600)`, [mShared]);
ok(Number((await c.query(`select hours from public.machines where id = $1`, [mShared])).rows[0].hours) === 1600, 'relevé d’un collaborateur : le compteur de la machine avance');
await as(A, 'aal1', `insert into public.hour_readings (machine_id, hours) values ($1, 900)`, [mShared]);
ok(Number((await c.query(`select hours from public.machines where id = $1`, [mShared])).rows[0].hours) === 1600, 'un relevé plus bas ne fait jamais reculer le compteur');
await c.query(`update public.fleet_members set role = 'lecture' where member_id = '${C3}'`);
await throws(() => as(C3, 'aal1', `insert into public.maintenance_logs (machine_id, operation, done_at_hours) values ($1, 'Vidange', 1700)`, [mShared]), 'lecture seule : n’ajoute pas d’entretien');
ok((await as(C3, 'aal1', `select id from public.machines`)).rowCount === nA, 'lecture seule : voit les machines');
ok((await as(ADM, 'aal1', `select id from public.machines`)).rowCount === 0, 'une personne non invitée ne voit rien du parc');
await c.query(`update public.profiles set plan = 'free' where id = '${A}'`);
ok((await as(C3, 'aal1', `select id from public.machines`)).rowCount === 0, 'titulaire repassé en Gratuit : l’accès partagé est suspendu');
ok((await as(C3, 'aal1', `select * from public.fleet_members`)).rowCount === 1, 'l’invité voit son accès');
ok((await as(B, 'aal1', `select * from public.fleet_members`)).rowCount === 0, 'un autre membre ne voit pas les accès des autres');

// --- Compte de démonstration ---
const D = '55555555-5555-5555-5555-555555555555';
await c.query(`insert into auth.users (id, email, raw_user_meta_data) values ('${D}', 'demo@x.fr', '{}')`);
await c.query(`update public.profiles set is_demo = true, plan = 'complet' where id = '${D}'`);
await throws(() => as(D, 'aal1', `insert into public.machines (name) values ('Tag')`), 'démo : aucune machine ne peut être ajoutée');
await c.query(`insert into public.machines (user_id, name) values ('${D}', 'Le Fendt')`);
ok((await as(D, 'aal1', `select * from public.machines`)).rowCount === 1, 'démo : le parc d’exemple est visible');
await throws(() => as(D, 'aal1', `update public.machines set name = 'Piraté'`), 'démo : les machines ne se modifient pas');
ok((await as(D, 'aal1', `update public.profiles set farm_name = 'Piraté' where id = '${D}'`)).rowCount === 0, 'démo : le profil ne se modifie pas');
await throws(() => as(B, 'aal1', `update public.profiles set is_demo = true where id = '${B}'`), 'un membre ne se déclare pas compte de démonstration');
await throws(() => c.query(`update public.profiles set is_demo = true where id = '${A}'`), 'un seul compte de démonstration');

// --- Boutique ---
const order = (uid) => c.query(`insert into public.shop_orders (user_id, email, items, subtotal_cents, shipping_cents, total_cents, status) values ($1, 'x@x.fr', '[]', 2500, 450, 2950, 'paid') returning id`, [uid]);
await order(A);
await order(B);
ok((await as(A, 'aal1', `select * from public.shop_orders`)).rowCount === 1, 'boutique : chacun ne voit que ses commandes');
ok((await as(ADM, 'aal2', `select * from public.shop_orders`)).rowCount === 2, 'boutique : l’admin (double authentification) voit toutes les commandes');
ok((await as(null, 'aal1', `select * from public.shop_orders`)).rowCount === 0, 'boutique : un visiteur ne voit aucune commande');
await throws(() => as(A, 'aal1', `insert into public.shop_orders (user_id, email, items, subtotal_cents, shipping_cents, total_cents) values ($1, 'a@x.fr', '[]', 1, 0, 1)`, [A]), 'boutique : un membre ne crée pas de commande lui-même');
await throws(() => as(A, 'aal1', `update public.shop_orders set status = 'shipped'`), 'boutique : un membre ne change pas le statut de sa commande');
await throws(() => as(A, 'aal1', `delete from public.shop_orders`), 'boutique : un membre ne supprime pas ses commandes');
await throws(() => c.query(`insert into public.shop_orders (user_id, email, items, subtotal_cents, shipping_cents, total_cents, status) values ($1, 'x@x.fr', '[]', 1, 0, 1, 'livree')`, [A]), 'boutique : statut inconnu refusé');

// --- Bourse au matériel ---
await c.query(`update public.profiles set suspended = false where id in ('${A}', '${B}')`);
const L = (await as(A, 'aal1', `insert into public.listings (seller_id, title, category, condition, price_cents, postal_code, city, department, status) values ($1, 'Herse rotative 3 m', 'travail_sol', 'bon', 250000, '34740', 'Vendargues', '34', 'en_ligne') returning id`, [A])).rows[0].id;
ok(Boolean(L), 'bourse : un membre publie une annonce');
await as(A, 'aal1', `insert into public.listings (seller_id, title, category, condition, price_cents, postal_code, city, department) values ($1, 'Brouillon de pièce', 'pieces', 'bon', 1000, '34740', 'Vendargues', '34')`, [A]);
ok((await as(null, 'aal1', `select id from public.listings`)).rowCount === 1, 'bourse : un visiteur voit les annonces en ligne, pas les brouillons');
ok((await as(A, 'aal1', `select id from public.listings`)).rowCount === 2, 'bourse : le vendeur voit aussi ses brouillons');
await throws(() => as(B, 'aal1', `insert into public.listings (seller_id, title, category, condition, price_cents, postal_code, city, department) values ($1, 'Annonce usurpée', 'pieces', 'bon', 1000, '34740', 'Vendargues', '34')`, [A]), 'bourse : on ne publie pas au nom d’un autre');
ok((await as(B, 'aal1', `update public.listings set price_cents = 100 where id = $1`, [L])).rowCount === 0, 'bourse : on ne modifie pas l’annonce d’un autre');
await throws(() => as(A, 'aal1', `update public.listings set status = 'moderee' where id = $1`, [L]), 'bourse : le vendeur ne se modère pas lui-même');
await c.query(`update public.listings set status = 'moderee' where id = $1`, [L]);
ok((await as(A, 'aal1', `update public.listings set status = 'en_ligne' where id = $1`, [L])).rowCount === 0, 'bourse : une annonce modérée ne se remet pas en ligne');
ok((await as(null, 'aal1', `select id from public.listings where id = $1`, [L])).rowCount === 0, 'bourse : une annonce modérée disparaît du public');
await c.query(`update public.listings set status = 'en_ligne' where id = $1`, [L]);
await throws(() => as(D, 'aal1', `insert into public.listings (seller_id, title, category, condition, price_cents, postal_code, city, department) values ($1, 'Démo qui publie', 'pieces', 'bon', 1000, '34740', 'Vendargues', '34')`, [D]), 'bourse : la démo ne publie pas');
const conv = (await c.query(`insert into public.listing_conversations (listing_id, buyer_id, seller_id) values ($1, $2, $3) returning id`, [L, B, A])).rows[0].id;
await c.query(`insert into public.listing_messages (conversation_id, sender_id, body) values ($1, $2, 'Toujours dispo ?')`, [conv, B]);
ok((await as(B, 'aal1', `select * from public.listing_messages`)).rowCount === 1, 'bourse : l’acheteur lit la conversation');
ok((await as(A, 'aal1', `select * from public.listing_messages`)).rowCount === 1, 'bourse : le vendeur lit la conversation');
ok((await as(C3, 'aal1', `select * from public.listing_messages`)).rowCount === 0, 'bourse : un tiers ne lit pas les messages');
await throws(() => as(B, 'aal1', `insert into public.listing_messages (conversation_id, sender_id, body) values ($1, $2, 'direct')`, [conv, B]), 'bourse : les messages passent par le serveur');
await as(B, 'aal1', `insert into public.listing_favorites (user_id, listing_id) values ($1, $2)`, [B, L]);
ok((await as(A, 'aal1', `select * from public.listing_favorites`)).rowCount === 0, 'bourse : les favoris sont privés');
await throws(() => as(B, 'aal1', `insert into public.listing_reports (listing_id, reporter_id, reason) values ($1, $2, 'arnaque')`, [L, B]), 'bourse : les signalements passent par le serveur');

// --- Bourse : paiement sécurisé ---
const O1 = (await c.query(`insert into public.listing_orders (listing_id, buyer_id, seller_id, snapshot, mode, status, price_cents, fee_cents, total_cents) values ($1, $2, $3, '{}', 'main_propre', 'paid', 250000, 4000, 254000) returning id`, [L, B, A])).rows[0].id;
ok((await as(B, 'aal1', `select id from public.listing_orders`)).rowCount === 1, 'paiement : l’acheteur voit sa transaction');
ok((await as(A, 'aal1', `select id from public.listing_orders`)).rowCount === 1, 'paiement : le vendeur voit sa transaction');
ok((await as(C3, 'aal1', `select id from public.listing_orders`)).rowCount === 0, 'paiement : un tiers ne voit rien');
await throws(() => as(B, 'aal1', `update public.listing_orders set status = 'completed' where id = $1`, [O1]), 'paiement : l’acheteur ne change pas le statut lui-même');
await throws(() => as(A, 'aal1', `update public.listing_orders set status = 'completed' where id = $1`, [O1]), 'paiement : le vendeur ne se débloque pas les fonds lui-même');
await throws(() => c.query(`insert into public.listing_orders (listing_id, buyer_id, seller_id, snapshot, mode, status, price_cents, fee_cents, total_cents) values ($1, $2, $3, '{}', 'envoi', 'paid', 250000, 4000, 254000)`, [L, C3, A]), 'paiement : une seule vente en cours par annonce');
await c.query(`insert into public.seller_accounts (user_id, stripe_account_id) values ($1, 'acct_test')`, [A]);
ok((await as(B, 'aal1', `select * from public.seller_accounts`)).rowCount === 0, 'paiement : le compte de versement d’un vendeur reste privé');
await throws(() => as(A, 'aal1', `update public.seller_accounts set payouts_enabled = true`), 'paiement : le vendeur ne s’autorise pas les versements lui-même');

await c.end();
await server.stop();
console.log(failures ? `\n${failures} test(s) en échec` : '\nTous les tests passent');
process.exit(failures ? 1 : 0);
