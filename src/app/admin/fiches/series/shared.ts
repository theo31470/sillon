import type { SheetContent } from '@/lib/sheets/schema';

export function seriesHref(brand: string, series: string) {
  return `/admin/fiches/series/voir?${new URLSearchParams({ marque: brand, serie: series }).toString()}`;
}

export type SheetQuality = 'complete' | 'correcte' | 'mince';

/** Repère rapide sur la richesse d'une fiche (caractéristiques renseignées, entretien, pannes). */
export function sheetQuality(c: SheetContent): SheetQuality {
  const specs = c.specs.reduce((n, g) => n + g.items.filter((i) => i.value).length, 0);
  if (specs < 12 || c.maintenance.length < 3) return 'mince';
  if (specs < 20 || c.faults.length < 3) return 'correcte';
  return 'complete';
}

export const QUALITY_LABEL: Record<SheetQuality, string> = { complete: 'Complète', correcte: 'Correcte', mince: 'Incomplète' };
