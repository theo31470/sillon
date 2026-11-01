import { NextResponse } from 'next/server';
import { getMaintenance } from '@/lib/maintenance-server';

export const dynamic = 'force-dynamic';

/** État public du site (utilisé par la page de maintenance pour se recharger dès la fin). */
export async function GET() {
  const m = await getMaintenance();
  return NextResponse.json({ maintenance: m.active, until: m.active ? m.until : null }, { headers: { 'Cache-Control': 'no-store' } });
}
