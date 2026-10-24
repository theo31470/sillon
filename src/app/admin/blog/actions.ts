'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';
import { parisLocalToDate, slugify } from '@/lib/format';
import { BLOG_CATEGORIES } from '@/lib/types';
import type { FormState } from '@/components/form-bits';

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function createDraft() {
  const { session, profile } = await requireAdmin('/admin/blog');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('blog_posts')
    .insert({ title: 'Nouvel article', slug: `brouillon-${Date.now().toString(36)}`, author_name: profile.full_name, status: 'draft' })
    .select('id')
    .single();
  if (error || !data) throw new Error('Création impossible');
  await logAudit(session, 'blog.brouillon_cree', { type: 'blog_post', id: data.id });
  redirect(`/admin/blog/${data.id}`);
}

const postSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(2, 'Titre trop court').max(200),
    slug: z.string().trim().max(80).transform((v) => slugify(v)),
    category: z.enum(Object.keys(BLOG_CATEGORIES) as [string, ...string[]]),
    excerpt: z.string().trim().max(400),
    content_md: z.string().max(100_000),
    author_name: z.string().trim().max(120),
    seo_description: z.string().trim().max(200),
    intent: z.enum(['draft', 'publish', 'schedule']),
    scheduled_at: z.string().optional(),
  })
  .refine((v) => v.slug.length >= 2, { message: 'Adresse de page invalide', path: ['slug'] });

export async function savePost(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/blog');
  const parsed = postSchema.safeParse({
    ...Object.fromEntries(formData),
    slug: formData.get('slug') || formData.get('title'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, intent, scheduled_at, ...fields } = parsed.data;
  const supabase = await createClient();

  // Photo de couverture (facultative)
  let cover_url: string | undefined;
  const file = formData.get('cover');
  if (file instanceof File && file.size > 0) {
    const ext = IMAGE_TYPES[file.type];
    if (!ext) return { error: 'Photo : formats acceptés JPG, PNG ou WebP.' };
    if (file.size > 5 * 1024 * 1024) return { error: 'Photo trop lourde (5 Mo maximum).' };
    const path = `blog/${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) return { error: 'Envoi de la photo impossible.' };
    cover_url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
  }

  let status: 'draft' | 'published' | 'scheduled' = 'draft';
  let published_at: string | null = null;
  if (intent === 'publish') {
    status = 'published';
    published_at = new Date().toISOString();
  } else if (intent === 'schedule') {
    const when = scheduled_at ? parisLocalToDate(scheduled_at) : null;
    if (!when || Number.isNaN(when.getTime()) || when.getTime() < Date.now()) return { error: 'Choisissez une date de programmation dans le futur.' };
    status = 'scheduled';
    published_at = when.toISOString();
  }

  // Garde la date de publication d'origine quand on met à jour un article déjà publié.
  if (intent === 'publish') {
    const { data: current } = await supabase.from('blog_posts').select('status, published_at').eq('id', id).single();
    if (current?.status === 'published' && current.published_at) published_at = current.published_at;
  }

  const { error } = await supabase
    .from('blog_posts')
    .update({ ...fields, status, published_at, ...(cover_url ? { cover_url } : {}) })
    .eq('id', id);
  if (error) {
    if (error.code === '23505') return { error: 'Cette adresse de page est déjà utilisée par un autre article.' };
    return { error: 'Enregistrement impossible.' };
  }
  await logAudit(session, `blog.${intent === 'publish' ? 'publie' : intent === 'schedule' ? 'programme' : 'enregistre'}`, { type: 'blog_post', id }, { slug: fields.slug });
  revalidatePath('/blog', 'layout');
  revalidatePath('/admin/blog', 'layout');
  return {
    ok: true,
    message: intent === 'publish' ? 'Article publié.' : intent === 'schedule' ? 'Publication programmée.' : 'Brouillon enregistré (non visible sur le site).',
  };
}

export async function deletePost(formData: FormData) {
  const { session } = await requireAdmin('/admin/blog');
  const id = z.string().uuid().parse(formData.get('id'));
  const supabase = await createClient();
  await supabase.from('blog_posts').delete().eq('id', id);
  await logAudit(session, 'blog.supprime', { type: 'blog_post', id });
  revalidatePath('/blog', 'layout');
  redirect('/admin/blog');
}
