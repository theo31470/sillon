import Link from 'next/link';
import type { Metadata } from 'next';
import { listPublishedPosts } from '@/lib/content';
import { PostCard } from '@/components/post-card';
import { inputClass } from '@/components/ui';
import { BLOG_CATEGORIES } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Conseils pratiques pour votre exploitation : réglementation, matériel, météo et gestion.',
};

export default async function BlogPage(props: PageProps<'/blog'>) {
  const { categorie, q } = await props.searchParams;
  const category = typeof categorie === 'string' && categorie in BLOG_CATEGORIES ? categorie : undefined;
  const search = typeof q === 'string' ? q.slice(0, 80) : undefined;
  const posts = await listPublishedPosts({ category, search });

  const pill = (active: boolean) =>
    `rounded-full px-4 py-2 text-[15px] ${active ? 'bg-brand font-semibold text-white' : 'border border-field bg-white text-ink hover:border-brand'}`;

  return (
    <>
      <section className="border-b border-line bg-ground">
        <div className="mx-auto max-w-6xl px-6 pb-10 pt-14">
          <h1 className="mb-3 text-[clamp(34px,4.2vw,48px)] font-bold tracking-tight">Le blog Sillon</h1>
          <p className="mb-7 max-w-2xl text-lg text-muted">Des conseils pratiques pour votre exploitation : réglementation, matériel, météo et gestion.</p>
          <div className="flex flex-wrap items-center gap-2.5">
            <form role="search" className="w-full max-w-sm">
              <label htmlFor="q" className="sr-only">Rechercher un article</label>
              <input id="q" name="q" type="search" defaultValue={search} placeholder="Rechercher un article…" className={inputClass} />
              {category ? <input type="hidden" name="categorie" value={category} /> : null}
            </form>
            <Link href="/blog" className={pill(!category)}>Tous</Link>
            {Object.entries(BLOG_CATEGORIES).map(([key, label]) => (
              <Link key={key} href={`/blog?categorie=${key}`} className={pill(category === key)}>{label}</Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        {posts.length === 0 ? (
          <p className="rounded-2xl bg-ground p-10 text-center text-muted">Aucun article pour le moment. Revenez bientôt !</p>
        ) : (
          <div className="grid gap-x-7 gap-y-10 [grid-template-columns:repeat(auto-fit,minmax(290px,1fr))]">
            {posts.map((p) => <PostCard key={p.id} post={p} />)}
          </div>
        )}
      </section>
    </>
  );
}
