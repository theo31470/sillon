import type { HourReading, Machine, MachineCost } from '@/lib/types';

/**
 * Coût de revient d'une machine, à l'heure de travail.
 *
 * Méthode (celle des barèmes d'entraide, simplifiée) :
 *  - charges fixes par an : amortissement (prix d'achat − valeur de revente) / durée,
 *    frais financiers (taux × capital moyen immobilisé), assurance ;
 *  - charges variables : carburant, entretien, réparations, pneumatiques, autres ;
 *  - heures de travail : relevés de compteur des 12 derniers mois (ramenés à un an),
 *    ou à défaut l'estimation saisie par l'exploitant.
 * Les montants sont en euros HT.
 */

export type CostBreakdown = {
  windowDays: number;
  /** Heures de travail par an retenues pour le calcul, et leur origine. */
  annualHours: number | null;
  hoursSource: 'releves' | 'estimation' | null;
  hoursWorked: number | null;
  fixed: { depreciation: number; interest: number; insurance: number; total: number; fullyDepreciated: boolean };
  variable: Record<'carburant' | 'entretien' | 'reparation' | 'pneumatiques' | 'autre', number> & { total: number };
  perHour: { fixed: number; variable: number; total: number } | null;
  fuelLitersPerHour: number | null;
  billingMargin: number | null;
  missing: string[];
};

const DAY = 86_400_000;

export function computeCosts(
  machine: Pick<Machine, 'purchase_date' | 'purchase_price' | 'resale_value' | 'depreciation_years' | 'interest_rate' | 'annual_hours_estimate' | 'billing_rate' | 'hours' | 'created_at'>,
  costs: MachineCost[],
  readings: HourReading[],
  now = new Date(),
): CostBreakdown {
  const windowDays = 365;
  const since = new Date(now.getTime() - windowDays * DAY).toISOString().slice(0, 10);
  const recent = costs.filter((c) => c.spent_on >= since);
  const missing: string[] = [];

  // Charges fixes annuelles
  const price = machine.purchase_price !== null ? Number(machine.purchase_price) : null;
  const resale = machine.resale_value !== null ? Number(machine.resale_value) : 0;
  const years = machine.depreciation_years || 7;
  let depreciation = 0;
  let fullyDepreciated = false;
  if (price === null) {
    missing.push('prix d’achat');
  } else {
    const start = machine.purchase_date ? Date.parse(machine.purchase_date) : null;
    fullyDepreciated = start !== null && now.getTime() > start + years * 365.25 * DAY;
    depreciation = fullyDepreciated ? 0 : Math.max(0, price - resale) / years;
  }
  const interest = price !== null ? ((price + resale) / 2) * (Number(machine.interest_rate) / 100) : 0;
  const insurance = recent.filter((c) => c.kind === 'assurance').reduce((s, c) => s + Number(c.amount), 0);
  const fixedTotal = depreciation + interest + insurance;

  // Charges variables sur 12 mois
  const variable = { carburant: 0, entretien: 0, reparation: 0, pneumatiques: 0, autre: 0, total: 0 };
  let liters = 0;
  for (const c of recent) {
    if (c.kind === 'assurance') continue;
    variable[c.kind] += Number(c.amount);
    variable.total += Number(c.amount);
    if (c.kind === 'carburant' && c.liters) liters += Number(c.liters);
  }

  // Heures travaillées : relevés de la période (+ compteur actuel)
  const points = [
    ...readings.map((r) => ({ day: r.read_on, hours: Number(r.hours) })),
    { day: now.toISOString().slice(0, 10), hours: Number(machine.hours) },
  ]
    .filter((p) => p.day >= since)
    .sort((a, b) => a.day.localeCompare(b.day) || a.hours - b.hours);
  let hoursWorked: number | null = null;
  let spanDays = 0;
  if (points.length >= 2) {
    hoursWorked = Math.max(0, points.at(-1)!.hours - points[0].hours);
    spanDays = (Date.parse(points.at(-1)!.day) - Date.parse(points[0].day)) / DAY;
  }

  let annualHours: number | null = null;
  let hoursSource: CostBreakdown['hoursSource'] = null;
  if (hoursWorked && spanDays >= 60) {
    annualHours = Math.round((hoursWorked * 365) / spanDays);
    hoursSource = 'releves';
  } else if (machine.annual_hours_estimate) {
    annualHours = machine.annual_hours_estimate;
    hoursSource = 'estimation';
  } else {
    missing.push('heures de travail par an (relevés sur au moins 2 mois, ou estimation)');
  }

  // Variable à l'heure : dépenses de la période / heures de la même période si possible.
  let perHour: CostBreakdown['perHour'] = null;
  let fuelLitersPerHour: number | null = null;
  if (annualHours && annualHours > 0) {
    const variableHours = hoursWorked && spanDays >= 30 ? hoursWorked : annualHours;
    const fixedPerHour = fixedTotal / annualHours;
    const variablePerHour = variableHours > 0 ? variable.total / variableHours : 0;
    perHour = { fixed: fixedPerHour, variable: variablePerHour, total: fixedPerHour + variablePerHour };
    if (liters > 0 && variableHours > 0) fuelLitersPerHour = liters / variableHours;
  }

  return {
    windowDays,
    annualHours,
    hoursSource,
    hoursWorked,
    fixed: { depreciation, interest, insurance, total: fixedTotal, fullyDepreciated },
    variable,
    perHour,
    fuelLitersPerHour,
    billingMargin: perHour && machine.billing_rate !== null ? Number(machine.billing_rate) - perHour.total : null,
    missing,
  };
}

export const euros = (n: number, digits = 0) =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits });
