import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublishedSheet } from '@/lib/content';
import { parseSheetContent } from '@/lib/sheets/schema';
import { SheetView } from '@/components/sheet-view';
import { PhotoSlot, btn } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { SHEET_CATEGORIES } from '@/lib/types';
import { getSession } from '@/lib/auth';
import { addMachineFromSheet } from '@/app/app/materiel/actions';

export async function generateMetadata(props: PageProps<'/fiches/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params;
  const sheet = await getPublishedSheet(slug);
  return sheet ? { title: sheet.title, description: sheet.summary } : { title: 'Fiche introuvable' };
}

export default async function SheetPage(props: PageProps<'/fiches/[slug]'>) {
  const { slug } = await props.params;
  const sheet = await getPublishedSheet(slug);
  if (!sheet) notFound();
  const content = parseSheetContent(sheet.content);
  let loggedIn = false;
  try { loggedIn = Boolean(await getSession()); } catch { /* base non configurée */ }

  return (
    <div className="bg-ground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <nav aria-label="Fil d’Ariane" className="flex flex-wrap gap-2 text-sm text-muted">
          <Link href="/fiches" className="text-brand">Fiches techniques</Link>
          <span aria-hidden="true">›</span>
          <Link href={`/fiches?categorie=${sheet.category}`} className="text-brand">{SHEET_CATEGORIES[sheet.category]}</Link>
          <span aria-hidden="true">›</span>
          <span className="text-ink">{sheet.title}</span>
        </nav>

        <section className="flex flex-wrap gap-8 rounded-2xl border border-line bg-white p-6">
          <PhotoSlot label={`Photo principale : ${sheet.title}`} className="h-72 min-w-0 flex-[1_1_420px]" />
          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
            <p className="flex flex-wrap gap-2 text-[13px] font-semibold">
              <span className="rounded-full bg-brand-soft px-3 py-1 text-brand-dark">✓ Relue avant publication</span>
              <span className="rounded-full bg-ground px-3 py-1 text-muted">Mise à jour le {formatDate(sheet.updated_at)}</span>
            </p>
            {sheet.brand || sheet.model ? <p className="text-muted">{[sheet.brand, sheet.model].filter(Boolean).join(' ')}</p> : null}
            <h1 className="text-[clamp(28px,3vw,36px)] font-bold leading-tight tracking-tight">{sheet.title}</h1>
            <p className="text-muted">{content.summary || sheet.summary}</p>
            {sheet.category === 'machine' ? (
              <div className="mt-auto flex flex-wrap gap-2.5">
                {loggedIn ? (
                  <form action={addMachineFromSheet}>
                    <input type="hidden" name="sheet_id" value={sheet.id} />
                    <input type="hidden" name="name" value={sheet.title} />
                    <button type="submit" className={btn.primary}>Ajouter à mon matériel</button>
                  </form>
                ) : (
                  <Link href={`/inscription`} className={btn.primary}>Suivre l’entretien de cette machine</Link>
                )}
              </div>
            ) : null}
          </div>
        </section>

        <SheetView content={content} />
      </div>
    </div>
  );
}
