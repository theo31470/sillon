import Image from 'next/image';
import Link from 'next/link';
import { PhotoSlot } from '@/components/ui';
import { BLOG_CATEGORIES, type BlogPost } from '@/lib/types';

export function PostCard({ post }: { post: Pick<BlogPost, 'slug' | 'title' | 'excerpt' | 'category' | 'cover_url'> }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group flex flex-col gap-2.5 text-ink">
      {post.cover_url ? (
        <Image src={post.cover_url} alt="" width={600} height={340} className="h-52 w-full rounded-2xl object-cover" />
      ) : (
        <PhotoSlot label="Photo de couverture à ajouter" className="h-52" />
      )}
      <p className="mt-1.5 text-sm font-semibold text-brand">{BLOG_CATEGORIES[post.category] ?? post.category}</p>
      <h3 className="text-xl font-semibold leading-snug group-hover:text-brand">{post.title}</h3>
      {post.excerpt ? <p className="text-[15px] text-muted">{post.excerpt}</p> : null}
    </Link>
  );
}
