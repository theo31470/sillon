import { after, NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { listBrandModels } from '@/lib/ai-web';
import { createServiceClient } from '@/lib/supabase/admin';

/**
 * OUTIL TEMPORAIRE : lance la liste des modèles d'une marque (même traitement que
 * l'écran « Import par marque »), sans passer par l'interface. Protégé par
 * PROBE_TOKEN. Les modèles trouvés arrivent « À générer » dans le catalogue.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ADMIN_ID = 'bd978d06-4de6-4724-9f89-dc24834d08bf';

export async function GET(request: NextRequest) {
  const token = process.env.PROBE_TOKEN ?? '';
  const given = request.nextUrl.searchParams.get('t') ?? '';
  if (token.length < 20 || given.length !== token.length || !timingSafeEqual(Buffer.from(given), Buffer.from(token))) {
    return NextResponse.json({ error: 'non' }, { status: 404 });
  }
  const brand = (request.nextUrl.searchParams.get('marque') ?? '').trim().slice(0, 60);
  const scope = (request.nextUrl.searchParams.get('perimetre') ?? 'gamme actuelle de tracteurs agricoles vendue en France').trim().slice(0, 120);
  if (brand.length < 2) return NextResponse.json({ error: 'marque ?' }, { status: 400 });

  after(async () => {
    try {
      const list = await listBrandModels({ userId: ADMIN_ID, brand, scope });
      const db = createServiceClient();
      const { data: existing } = await db.from('catalog_models').select('model').ilike('brand', brand);
      const known = new Set((existing ?? []).map((r) => r.model.toLowerCase()));
      const brandPrefix = new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i');
      const rows = [];
      for (const m of list.models) {
        const model = m.model.replace(brandPrefix, '').trim().slice(0, 120);
        if (!model || known.has(model.toLowerCase())) continue;
        known.add(model.toLowerCase());
        rows.push({
          brand,
          series: m.series.trim().slice(0, 120),
          model,
          years: m.years.trim().slice(0, 40),
          power_hp: m.power_hp && m.power_hp > 0 && m.power_hp < 2000 ? m.power_hp : null,
          source_url: m.source_url && /^https?:\/\//.test(m.source_url) ? m.source_url.slice(0, 500) : null,
          created_by: ADMIN_ID,
        });
      }
      if (rows.length) await db.from('catalog_models').insert(rows);
      console.info('[catalogue-liste]', brand, 'trouvés', list.models.length, 'ajoutés', rows.length, list.note ?? '');
    } catch (err) {
      console.error('[catalogue-liste]', brand, err);
    }
  });
  return NextResponse.json({ ok: true, brand, scope });
}
