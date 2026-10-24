import 'server-only';
import { createServiceClient } from '@/lib/supabase/admin';
import type { PdfSource } from '@/lib/ai';
import type { SheetSource } from '@/lib/types';

/** Taille totale maximale des documents envoyés à Claude en une fois. */
export const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
export const MAX_FILES = 3;

/**
 * Récupère les PDF sources depuis le stockage privé « sources ».
 * Les chemins sont vérifiés pour n'accepter que ce dossier.
 */
export async function downloadSources(sources: SheetSource[]): Promise<PdfSource[]> {
  const storage = createServiceClient().storage.from('sources');
  let total = 0;
  const out: PdfSource[] = [];
  for (const s of sources.slice(0, MAX_FILES)) {
    if (!/^[0-9a-f-]{36}\/[\w.\- ]{1,120}\.pdf$/i.test(s.path)) throw new Error(`Chemin de document invalide : ${s.path}`);
    const { data, error } = await storage.download(s.path);
    if (error || !data) throw new Error(`Document introuvable : ${s.name}`);
    const buffer = Buffer.from(await data.arrayBuffer());
    if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error(`${s.name} n’est pas un PDF valide`);
    total += buffer.length;
    if (total > MAX_TOTAL_BYTES) throw new Error('Documents trop volumineux (30 Mo au total maximum)');
    out.push({ name: s.name, base64: buffer.toString('base64') });
  }
  return out;
}
