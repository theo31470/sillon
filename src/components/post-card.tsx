import Image from 'next/image';
import Link from 'next/link';
import { PhotoSlot } from '@/components/ui';
import { BLOG_CATEGORIES, type BlogPost } from '@/lib/types';

export function PostCard({ post }: { post: Pick<BlogPost, 'slug' | 'title' | 'excerpt' | 'category' | 'cover_url'> }) {
  return (
    <Link href={`/blog/${post.slug}`} className="reveal group flex flex-col gap-2.5 text-ink">
      {post.cover_url ? (
        <span className="block overflow-hidden rounded-2xl">
          <Image src={post.cover_url} alt="" width={600} height={340} className="h-52 w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        </span>
      ) : (
        <span className="block overflow-hidden rounded-2xl">
          <PhotoSlot label="Photo de couverture à ajouter" className="h-52 group-hover:scale-105" />
        </span>
      )}
      <p className="mt-1.5 text-sm font-semibold text-brand">{BLOG_CATEGORIES[post.category] ?? post.category}</p>
      <h3 className="text-xl font-semibold leading-snug transition-colors group-hover:text-brand">{post.title}</h3>
      {post.excerpt ? <p className="text-[15px] text-muted">{post.excerpt}</p> : null}
    </Link>
  );
}
