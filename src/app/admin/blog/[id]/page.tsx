import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { BLOG_CATEGORIES, type BlogPost } from '@/lib/types';
import { ActionForm } from '@/components/action-form';
import { Field, Input, Select, Textarea, btn } from '@/components/ui';
import { deletePost, savePost } from '../actions';

export const metadata = { title: 'Modifier un article' };

export default async function EditPostPage(props: PageProps<'/admin/blog/[id]'>) {
  const { id } = await props.params;
  await requireAdmin(`/admin/blog/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from('blog_posts').select('*').eq('id', id).maybeSingle();
  const post = data as BlogPost | null;
  if (!post) notFound();

  return (
    <>
      <Link href="/admin/blog" className="text-sm text-brand">← Tous les articles</Link>
      <ActionForm action={savePost} resetOnSuccess={false} className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6">
        <input type="hidden" name="id" value={post.id} />
        <label htmlFor="title" className="sr-only">Titre</label>
        <input id="title" name="title" defaultValue={post.title} required maxLength={200} className="border-b border-line pb-3 text-[26px] font-bold outline-none focus:border-brand" />

        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2">
            {post.cover_url ? (
              <Image src={post.cover_url} alt="Couverture actuelle" width={520} height={260} className="h-40 w-full rounded-xl object-cover" />
            ) : (
              <div className="flex h-40 items-center justify-center rounded-xl border-2 border-dashed border-field bg-ground text-sm text-muted">Pas encore de photo de couverture</div>
            )}
            <label htmlFor="cover" className="text-sm font-semibold">Photo de couverture (JPG, PNG, WebP · 5 Mo max)</label>
            <input id="cover" name="cover" type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" />
          </div>
          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-3">
            <Field label="Catégorie" htmlFor="category">
              <Select id="category" name="category" defaultValue={post.category}>
                {Object.entries(BLOG_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Auteur" htmlFor="author_name">
              <Input id="author_name" name="author_name" defaultValue={post.author_name} maxLength={120} />
            </Field>
          </div>
        </div>

        <Field label="Chapeau (résumé affiché dans la liste)" htmlFor="excerpt">
          <Textarea id="excerpt" name="excerpt" defaultValue={post.excerpt} maxLength={400} rows={2} />
        </Field>
        <Field label="Contenu" htmlFor="content_md" hint="Mise en forme : ## Titre, ### Sous-titre, - liste, **gras**, *italique*, [lien](https://…)">
          <Textarea id="content_md" name="content_md" defaultValue={post.content_md} rows={18} className="font-mono text-[15px]" />
        </Field>

        <details className="rounded-xl border border-line px-4 py-3.5">
          <summary className="cursor-pointer font-semibold">Référencement Google</summary>
          <div className="mt-3 flex flex-col gap-3">
            <Field label="Adresse de la page" htmlFor="slug" hint="/blog/…  (lettres, chiffres et tirets)">
              <Input id="slug" name="slug" defaultValue={post.slug} maxLength={80} />
            </Field>
            <Field label="Description (affichée dans Google, 200 caractères max)" htmlFor="seo_description">
              <Textarea id="seo_description" name="seo_description" defaultValue={post.seo_description} maxLength={200} rows={2} />
            </Field>
          </div>
        </details>

        <div className="flex flex-wrap items-end gap-3 border-t border-line pt-5">
          <button type="submit" name="intent" value="draft" className={btn.secondary}>Enregistrer le brouillon</button>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Programmer le" htmlFor="scheduled_at">
              <Input id="scheduled_at" name="scheduled_at" type="datetime-local" className="w-auto" />
            </Field>
            <button type="submit" name="intent" value="schedule" className={btn.secondary}>Programmer</button>
          </div>
          <button type="submit" name="intent" value="publish" className={btn.primary}>{post.status === 'published' ? 'Mettre à jour' : 'Publier'}</button>
        </div>
      </ActionForm>
      <form action={deletePost} className="text-right">
        <input type="hidden" name="id" value={post.id} />
        <button type="submit" className="text-sm text-danger hover:underline">Supprimer cet article</button>
      </form>
    </>
  );
}
