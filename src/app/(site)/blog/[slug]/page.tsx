import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublishedPost } from '@/lib/content';
import { renderMarkdown } from '@/lib/markdown';
import { formatDate } from '@/lib/format';
import { BLOG_CATEGORIES } from '@/lib/types';
import { btn } from '@/components/ui';

export async function generateMetadata(props: PageProps<'/blog/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params;
  const post = await getPublishedPost(slug);
  if (!post) return { title: 'Article introuvable' };
  return {
    title: post.title,
    description: post.seo_description || post.excerpt,
    openGraph: { title: post.title, description: post.seo_description || post.excerpt, images: post.cover_url ? [post.cover_url] : [] },
  };
}

export default async function PostPage(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-3xl px-6 py-14">
      <Link href="/blog" className="text-sm text-brand">← Tous les articles</Link>
      <p className="mb-3 mt-6 text-sm font-semibold text-brand">{BLOG_CATEGORIES[post.category]}</p>
      <h1 className="mb-4 text-[clamp(30px,4vw,44px)] font-bold leading-tight tracking-tight">{post.title}</h1>
      <p className="mb-8 text-muted">
        {post.author_name ? `${post.author_name} · ` : ''}
        {formatDate(post.published_at, { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>
      {post.cover_url ? (
        <Image src={post.cover_url} alt="" width={1200} height={630} className="mb-10 h-auto w-full rounded-2xl object-cover" priority />
      ) : null}
      {/* Rendu sûr : le HTML saisi est échappé (voir src/lib/markdown.ts). */}
      <div className="prose-sillon text-[17px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content_md) }} />
      <aside className="mt-14 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-ground p-7">
        <p className="font-semibold">Gérez votre exploitation simplement avec Sillon.</p>
        <Link href="/inscription" className={btn.primary}>Essayer gratuitement</Link>
      </aside>
    </article>
  );
}
