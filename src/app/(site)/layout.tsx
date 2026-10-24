import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { PageTransition } from '@/components/motion';

export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <PageTransition>
          <div>{children}</div>
        </PageTransition>
      </main>
      <SiteFooter />
    </>
  );
}
