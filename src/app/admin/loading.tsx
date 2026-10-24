import { PageLoader } from '@/components/page-loader';

export default function Loading() {
  return <PageLoader label="Chargement…" skeleton={false} />;
}
