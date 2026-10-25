import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import { BLOG_CATEGORIES, type BlogPost } from '@/lib/types';
import { Badge, btn } from '@/components/ui';
import { createDraft } from './actions';

export const metadata = { title: 'Blog' };

export default async function AdminBlogPage() {
  await requireAdmin('/admin/blog');
  const supabase = await createClient();
  const { data } = await supabase.from('blog_posts').select('id, slug, title, category, status, published_at, updated_at').order('updated_at', { ascending: false });
  const posts = (data ?? []) as Pick<BlogPost, 'id' | 'slug' | 'title' | 'category' | 'status' | 'published_at' | 'updated_at'>[];
  const statusBadge = (p: (typeof posts)[number]) =>
    p.status === 'draft' ? <Badge tone="amber">Brouillon</Badge> : p.status === 'scheduled' && p.published_at && new Date(p.published_at) > new Date() ? <Badge tone="blue">Programmé · {formatDate(p.published_at)}</Badge> : <Badge tone="green">Publié</Badge>;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3.5">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Blog</h1>
          <p className="text-muted">{posts.length} article{posts.length > 1 ? 's' : ''}</p>
        </div>
        <form action={createDraft}><button type="submit" className={btn.primary}>Nouvel article</button></form>
      </div>
      <section className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[13px] text-muted">
              {['Titre', 'Catégorie', 'Statut', 'Modifié le', ''].map((h) => <th key={h} className="border-b border-line px-4 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id}>
                <td className="border-b border-line-soft px-4 py-3.5 font-semibold"><Link href={`/admin/blog/${p.id}`} className="text-ink hover:text-brand">{p.title}</Link></td>
                <td className="border-b border-line-soft px-4 py-3.5">{BLOG_CATEGORIES[p.category]}</td>
                <td className="border-b border-line-soft px-4 py-3.5">{statusBadge(p)}</td>
                <td className="border-b border-line-soft px-4 py-3.5">{formatDate(p.updated_at)}</td>
                <td className="border-b border-line-soft px-4 py-3.5 text-right">
                  {p.status !== 'draft' ? <Link href={`/blog/${p.slug}`} className="font-semibold text-brand" target="_blank">Voir</Link> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
