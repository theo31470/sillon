import type { SheetContent } from '@/lib/sheets/schema';

/**
 * Lecture « intelligente » d'une fiche pour l'affichage : type de machine,
 * chiffres clés, gabarit, carnet d'entretien. Fonctions pures, sans accès réseau.
 */

export type MachineKind = 'tracteur' | 'moissonneuse' | 'motoculteur' | 'pulverisateur' | 'outil';

const KIND_RULES: [MachineKind, RegExp][] = [
  ['moissonneuse', /moissonneuse|batteuse|ensileuse|r[ée]colteuse/i],
  ['motoculteur', /motoculteur|motobineuse|microtracteur|micro-tracteur|tondeuse|d[ée]broussailleuse/i],
  ['pulverisateur', /pulv[ée]risateur|[ée]pandeur|tonne [àa] lisier/i],
  ['outil', /charrue|herse|d[ée]chaumeur|cultivateur|semoir|rouleau|faucheuse|andaineur|faneuse|presse|remorque|benne|broyeur|outil/i],
  ['tracteur', /tracteur|vario/i],
];

export function machineKind(sheet: { title: string; brand?: string; model?: string; category?: string }): MachineKind {
  const text = `${sheet.title} ${sheet.brand ?? ''} ${sheet.model ?? ''}`;
  for (const [kind, re] of KIND_RULES) if (re.test(text)) return kind;
  return sheet.category === 'machine' ? 'tracteur' : 'outil';
}

export const MACHINE_KIND_LABELS: Record<MachineKind, string> = {
  tracteur: 'Tracteur',
  moissonneuse: 'Récolte',
  motoculteur: 'Petit matériel',
  pulverisateur: 'Pulvérisation & épandage',
  outil: 'Outil',
};

type SpecItem = SheetContent['specs'][number]['items'][number];

function allSpecs(content: SheetContent): SpecItem[] {
  return content.specs.flatMap((g) => g.items).filter((i) => i.value);
}

/** Sépare « 380 kW (517 ch) » en valeur principale + complément. */
function splitValue(value: string): { main: string; sub: string | null } {
  const m = value.match(/^([^(;]+?)\s*\(([^)]*)\)/);
  let main = (m ? m[1] : value.split(/[;(]/)[0]).trim();
  let sub = m ? m[2].trim() : null;
  // Les agriculteurs parlent en chevaux : on met « ch » en avant si présent.
  if (sub && /\bch\b/.test(sub) && /kW/i.test(main)) [main, sub] = [sub, main];
  return { main, sub };
}

export type KeyFigure = { key: string; label: string; main: string; sub: string | null };

const FIGURE_RULES: { key: string; label: string; match: RegExp; unit?: RegExp; exclude?: RegExp }[] = [
  { key: 'power', label: 'Puissance', match: /puissance/i, unit: /ch|kW/i },
  { key: 'weight', label: 'Poids à vide', match: /poids|masse (à vide|en ordre|totale)/i, unit: /kg|\bt\b/i, exclude: /PTAC|charge|disponible|roue/i },
  { key: 'speed', label: 'Vitesse max.', match: /vitesse max/i, unit: /km\/h/i },
  { key: 'width', label: 'Largeur de travail', match: /largeur de travail|largeur de coupe/i, unit: /m\b|mm|cm/i },
  { key: 'fuel', label: 'Réservoir', match: /r[ée]servoir.*(carburant|gazole|gasoil|essence)|capacit[ée].*(carburant|gazole)/i, unit: /l\b|litre/i },
  { key: 'tank', label: 'Cuve / trémie', match: /cuve|tr[ée]mie/i, unit: /l\b|litre|m³|m3/i },
  { key: 'hydraulic', label: 'Débit hydraulique', match: /d[ée]bit|pompe/i, unit: /l\/min/i },
  { key: 'lift', label: 'Relevage', match: /relevage|levage/i, unit: /daN|kg/i },
  { key: 'displacement', label: 'Cylindrée', match: /cylindr[ée]e/i, unit: /cm|l\b/i },
];

/** Jusqu'à 4 chiffres clés, dans l'ordre de priorité ci-dessus. */
export function keyFigures(content: SheetContent, max = 4): KeyFigure[] {
  const specs = allSpecs(content);
  const out: KeyFigure[] = [];
  for (const rule of FIGURE_RULES) {
    if (out.length >= max) break;
    const item = specs.find(
      (s) => rule.match.test(s.label) && !(rule.exclude?.test(s.label)) && (!rule.unit || rule.unit.test(s.value ?? '')),
    );
    if (!item?.value) continue;
    const { main, sub } = splitValue(item.value);
    if (!main || main.length > 16) continue;
    out.push({ key: rule.key, label: rule.label, main, sub: sub && sub.length <= 28 ? sub : null });
  }
  return out;
}

export type Dimensions = Partial<Record<'length' | 'height' | 'wheelbase' | 'width' | 'clearance', string>>;

/** Cotes utiles au schéma de gabarit (longueur, hauteur, empattement…). */
export function dimensions(content: SheetContent): Dimensions {
  const specs = allSpecs(content);
  const pick = (re: RegExp, exclude?: RegExp) => {
    const s = specs.find((i) => re.test(i.label) && !(exclude?.test(i.label)) && /\d/.test(i.value ?? ''));
    return s?.value ? splitValue(s.value).main : undefined;
  };
  const d: Dimensions = {
    length: pick(/longueur/i, /travail|coupe|timon/i),
    height: pick(/hauteur/i, /VarioGuide|attelage|crochet/i) ?? pick(/hauteur/i),
    wheelbase: pick(/empattement/i),
    width: pick(/largeur hors tout|largeur totale|largeur/i, /voie|travail|coupe/i),
    clearance: pick(/garde au sol/i),
  };
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v)) as Dimensions;
}

export type GroupIcon = 'engine' | 'gear' | 'drop' | 'hitch' | 'wheel' | 'ruler' | 'weight' | 'cabin' | 'bolt' | 'can' | 'blade' | 'wrench';

const GROUP_ICON_RULES: [GroupIcon, RegExp][] = [
  ['engine', /moteur|motorisation/i],
  ['gear', /transmission|bo[iî]te|prise de force|pdf/i],
  ['hitch', /relevage|attelage/i],
  ['drop', /hydrau/i],
  ['wheel', /pneu|roue|essieu|direction|freinage/i],
  ['ruler', /dimension|gabarit|encombrement/i],
  ['weight', /masse|poids/i],
  ['cabin', /cabine|confort|poste de conduite/i],
  ['bolt', /[ée]lectri|batterie|[ée]clairage/i],
  ['can', /capacit|r[ée]servoir|cuve|niveaux/i],
  ['blade', /travail|coupe|outil|r[ée]colte|battage|semis/i],
];

export function groupIcon(group: string): GroupIcon {
  for (const [icon, re] of GROUP_ICON_RULES) if (re.test(group)) return icon;
  return 'wrench';
}

type Maintenance = SheetContent['maintenance'][number];
export type MaintenanceBucket = { key: string; label: string; hours: number | null; months: number | null; items: Maintenance[] };

function bucketLabel(hours: number | null, months: number | null) {
  const h = hours ? `${hours.toLocaleString('fr-FR')} h` : null;
  const m = months ? `${months} mois` : null;
  if (h && m) return `Toutes les ${h} ou ${m}`;
  if (h) return `Toutes les ${h}`;
  if (m) return `Tous les ${m}`;
  return 'Périodicité non précisée';
}

/** Regroupe les opérations par périodicité, de la plus fréquente à la plus rare. */
export function maintenanceBuckets(items: Maintenance[]): MaintenanceBucket[] {
  const map = new Map<string, MaintenanceBucket>();
  for (const it of items) {
    const key = `${it.interval_hours ?? ''}|${it.interval_months ?? ''}`;
    if (!map.has(key)) {
      map.set(key, { key, label: bucketLabel(it.interval_hours, it.interval_months), hours: it.interval_hours, months: it.interval_months, items: [] });
    }
    map.get(key)!.items.push(it);
  }
  const rank = (b: MaintenanceBucket) => (b.hours ? b.hours : b.months ? 100_000 + b.months : 1_000_000);
  return [...map.values()].sort((a, b) => rank(a) - rank(b));
}

/** Position (0–1) d'un intervalle en heures sur l'échelle du compteur (logarithmique). */
export function hourScalePosition(hours: number, maxHours: number) {
  const min = 10;
  const max = Math.max(maxHours, 500);
  const t = Math.min(1, Math.max(0, Math.log(Math.max(hours, min) / min) / Math.log(max / min)));
  // On garde une marge à droite pour l'étiquette du dernier repère.
  return 0.04 + t * 0.88;
}
