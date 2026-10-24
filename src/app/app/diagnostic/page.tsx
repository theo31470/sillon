import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card, btn } from '@/components/ui';
import { DiagnosticForm } from './diagnostic-form';

export const metadata: Metadata = { title: 'Aide au diagnostic' };
export const maxDuration = 60;

export default async function DiagnosticPage() {
  const { profile } = await requireUser('/app/diagnostic');
  const supabase = await createClient();
  const { data } = await supabase.from('machines').select('id, name').order('name');
  const free = profile.plan === 'free';

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Aide au diagnostic</h1>
        <p className="text-muted">Décrivez ce qui se passe : vous obtenez les causes probables et les vérifications à faire, dans l’ordre.</p>
      </div>
      {free ? (
        <Card className="flex flex-wrap items-center justify-between gap-4 bg-brand-tint">
          <p className="font-medium">L’aide au diagnostic est incluse dans la formule Complet.</p>
          <Link href="/app/abonnement" className={btn.primary}>Voir la formule Complet</Link>
        </Card>
      ) : null}
      <DiagnosticForm machines={data ?? []} disabled={free} />
    </>
  );
}
