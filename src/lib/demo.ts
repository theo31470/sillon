import 'server-only';
import { createServiceClient } from '@/lib/supabase/admin';
import { maintenancePlan } from '@/lib/maintenance';

/**
 * Démo sans inscription : un compte d'exemple (« EARL des Trois Chênes ») avec un
 * parc réaliste. Les visiteurs y entrent en un clic ; la base refuse toute
 * écriture de ce compte (private.is_active_member), et chaque action du site
 * les invite à créer leur propre compte. Le parc est régénéré chaque jour pour
 * que les dates et les échéances restent parlantes.
 */

export const DEMO_EMAIL = 'demo@tracteursandco.fr';
const DAY = 86_400_000;
const isoDay = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().slice(0, 10);

/** Identifiant du compte de démonstration, créé au premier besoin. */
export async function ensureDemoUser(): Promise<string> {
  const db = createServiceClient();
  const { data: existing } = await db.from('profiles').select('id').eq('is_demo', true).maybeSingle();
  if (existing) return existing.id as string;

  let userId: string | null = null;
  const { data: created, error } = await db.auth.admin.createUser({
    email: DEMO_EMAIL,
    email_confirm: true,
    user_metadata: { full_name: 'Julien Morel', farm_name: 'EARL des Trois Chênes (démo)' },
  });
  if (created?.user) userId = created.user.id;
  else {
    // Déjà créé (par une requête parallèle) : on le retrouve par son adresse.
    const { data: p } = await db.from('profiles').select('id').eq('email', DEMO_EMAIL).maybeSingle();
    userId = (p?.id as string | undefined) ?? null;
    if (!userId) throw new Error(`Compte de démonstration impossible à créer : ${error?.message ?? 'inconnu'}`);
  }
  await db
    .from('profiles')
    .update({
      is_demo: true,
      full_name: 'Julien Morel',
      farm_name: 'EARL des Trois Chênes (démo)',
      plan: 'complet',
      comp_active: true,
      comp_until: null,
      email_reminders: false,
      email_news: false,
    })
    .eq('id', userId);
  return userId;
}

/**
 * Garde-fou : personne ne doit pouvoir verrouiller le compte partagé (double
 * authentification ajoutée par un visiteur via l'API d'authentification).
 */
export async function unlockDemoUser(userId: string) {
  const admin = createServiceClient().auth.admin;
  const { data } = await admin.mfa.listFactors({ userId });
  for (const f of data?.factors ?? []) await admin.mfa.deleteFactor({ userId, id: f.id });
}

type SeedMachine = {
  name: string;
  kind: string;
  brand: string;
  model: string;
  year: number;
  slug?: string;
  hours: number;
  perMonth: number;
  purchase: { date: string; price: number; resale: number; years: number; rate: number };
  billing?: number;
  tasks?: { operation: string; interval_hours: number | null; interval_months: number | null }[];
  fuelLitersPerHour: number;
  insurance: number;
  repairs?: { label: string; amount: number; daysAgo: number; kind?: string }[];
};

const MACHINES: SeedMachine[] = [
  {
    name: 'Le Fendt',
    kind: 'tracteur',
    brand: 'Fendt',
    model: '724 Vario',
    year: 2020,
    slug: 'fendt-724-vario',
    hours: 4820,
    perMonth: 62,
    purchase: { date: '2020-03-12', price: 238000, resale: 120000, years: 7, rate: 3.2 },
    billing: 85,
    fuelLitersPerHour: 14.5,
    insurance: 1450,
    repairs: [{ label: 'Remplacement du compresseur de clim', amount: 1240, daysAgo: 120, kind: 'reparation' }, { label: '2 pneus avant 600/70 R28', amount: 2980, daysAgo: 210, kind: 'pneumatiques' }],
  },
  {
    name: 'Le petit Fendt',
    kind: 'tracteur',
    brand: 'Fendt',
    model: '312 Vario',
    year: 2017,
    slug: 'fendt-312-vario',
    hours: 6230,
    perMonth: 38,
    purchase: { date: '2017-09-01', price: 98000, resale: 45000, years: 8, rate: 2.9 },
    fuelLitersPerHour: 8.2,
    insurance: 820,
  },
  {
    name: 'Le télesco',
    kind: 'telescopique',
    brand: 'Manitou',
    model: 'MLT 737',
    year: 2019,
    hours: 3410,
    perMonth: 45,
    purchase: { date: '2019-02-15', price: 86000, resale: 40000, years: 8, rate: 2.5 },
    tasks: [
      { operation: 'Graissage du bras et des articulations', interval_hours: 10, interval_months: null },
      { operation: 'Vidange moteur et filtre à huile', interval_hours: 500, interval_months: 12 },
      { operation: 'Filtre à air', interval_hours: 500, interval_months: 12 },
      { operation: 'Vidange de l’huile hydraulique', interval_hours: 1000, interval_months: 24 },
    ],
    fuelLitersPerHour: 6.5,
    insurance: 690,
    repairs: [{ label: 'Flexible hydraulique du bras', amount: 380, daysAgo: 40, kind: 'reparation' }],
  },
  {
    name: 'La moissonneuse',
    kind: 'moissonneuse',
    brand: 'Claas',
    model: 'Lexion 760',
    year: 2016,
    hours: 2380,
    perMonth: 18,
    purchase: { date: '2016-06-20', price: 310000, resale: 120000, years: 10, rate: 3 },
    billing: 160,
    tasks: [
      { operation: 'Graissage quotidien', interval_hours: 10, interval_months: null },
      { operation: 'Vidange moteur et filtres', interval_hours: 250, interval_months: 12 },
      { operation: 'Contrôle des courroies et des chaînes', interval_hours: 100, interval_months: 12 },
    ],
    fuelLitersPerHour: 32,
    insurance: 2100,
    repairs: [{ label: 'Remplacement des sections de coupe', amount: 860, daysAgo: 95, kind: 'reparation' }],
  },
];

/** Parc d'exemple régénéré : vidé puis recréé avec des dates relatives à aujourd'hui. */
export async function seedDemo(userId: string, opts: { force?: boolean } = {}) {
  const db = createServiceClient();
  if (!opts.force) {
    const { data: newest } = await db.from('machines').select('created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (newest && Date.now() - Date.parse(newest.created_at as string) < 20 * 3600_000) return false;
  }
  await db.from('machines').delete().eq('user_id', userId);

  const slugs = MACHINES.map((m) => m.slug).filter(Boolean) as string[];
  const { data: sheets } = await db.from('tech_sheets').select('id, slug, content').in('slug', slugs).eq('status', 'published');

  for (const spec of MACHINES) {
    const sheet = (sheets ?? []).find((s) => s.slug === spec.slug) ?? null;
    const { data: machine, error } = await db
      .from('machines')
      .insert({
        user_id: userId,
        name: spec.name,
        kind: spec.kind,
        brand: spec.brand,
        model: spec.model,
        year: spec.year,
        sheet_id: sheet?.id ?? null,
        hours: spec.hours,
        purchase_date: spec.purchase.date,
        purchase_price: spec.purchase.price,
        resale_value: spec.purchase.resale,
        depreciation_years: spec.purchase.years,
        interest_rate: spec.purchase.rate,
        billing_rate: spec.billing ?? null,
        registration: spec.kind === 'moissonneuse' || spec.kind === 'tracteur' ? `${['AB', 'CD', 'EF', 'GH'][MACHINES.indexOf(spec)]}-${120 + MACHINES.indexOf(spec) * 37}-KT` : '',
      })
      .select('id')
      .single();
    if (error || !machine) throw new Error(`Démo : machine ${spec.name} : ${error?.message}`);
    const machineId = machine.id as string;

    // Relevés mensuels sur un an : la base du coût de revient et des heures travaillées.
    const readings = Array.from({ length: 12 }, (_, i) => ({
      user_id: userId,
      machine_id: machineId,
      hours: Math.max(0, spec.hours - spec.perMonth * (11 - i) - (i < 11 ? 4 : 0)),
      read_on: isoDay((11 - i) * 30 * DAY + (i === 11 ? 2 * DAY : 0)),
    }));
    await db.from('hour_readings').insert(readings);

    if (spec.tasks?.length) await db.from('machine_tasks').insert(spec.tasks.map((t) => ({ ...t, user_id: userId, machine_id: machineId })));

    // Historique d'entretien : une échéance en retard, une bientôt, le reste à jour.
    const plan = maintenancePlan(sheet?.content ?? null, (spec.tasks ?? []).map((t, i) => ({ id: String(i), machine_id: machineId, ...t })));
    const logs: Record<string, unknown>[] = [];
    plan.forEach((p, i) => {
      if (!p.intervalHours) return;
      const offset = i === 0 ? p.intervalHours + 12 : i === 1 ? p.intervalHours - 18 : Math.round(p.intervalHours * 0.4);
      const doneAt = Math.max(0, spec.hours - offset);
      const daysAgo = Math.min(330, Math.round((offset / Math.max(spec.perMonth, 1)) * 30));
      logs.push({ user_id: userId, machine_id: machineId, operation: p.operation, done_at_hours: doneAt, done_on: isoDay(daysAgo * DAY), notes: i === 2 ? 'Fait à la ferme' : 'Ets Martin Agri' });
    });
    if (logs.length) await db.from('maintenance_logs').insert(logs);

    // Dépenses : gazole tous les mois, assurance, réparations.
    const costs: Record<string, unknown>[] = Array.from({ length: 12 }, (_, i) => {
      const liters = Math.round(spec.perMonth * spec.fuelLitersPerHour);
      return { user_id: userId, machine_id: machineId, kind: 'carburant', label: 'GNR', amount: Math.round(liters * 1.12), liters, spent_on: isoDay((i * 30 + 5) * DAY) };
    });
    costs.push({ user_id: userId, machine_id: machineId, kind: 'assurance', label: 'Assurance annuelle', amount: spec.insurance, spent_on: isoDay(150 * DAY) });
    for (const r of spec.repairs ?? []) costs.push({ user_id: userId, machine_id: machineId, kind: r.kind ?? 'reparation', label: r.label, amount: r.amount, spent_on: isoDay(r.daysAgo * DAY) });
    await db.from('machine_costs').insert(costs);
  }
  return true;
}
