import Link from 'next/link';
import { listPublishedPosts } from '@/lib/content';
import { PostCard } from '@/components/post-card';

export async function LatestPosts() {
  const posts = await listPublishedPosts({ limit: 3 });
  if (posts.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">Nos derniers conseils</h2>
        <Link href="/blog" className="font-semibold text-brand">Voir tous les articles</Link>
      </div>
      <div className="grid gap-7 [grid-template-columns:repeat(auto-fit,minmax(min(290px,100%),1fr))]">
        {posts.map((p) => <PostCard key={p.id} post={p} />)}
      </div>
    </section>
  );
}
