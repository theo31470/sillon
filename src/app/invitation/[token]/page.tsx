import Link from 'next/link';
import type { Metadata } from 'next';
import { getSession } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/admin';
import { ROLE_LABELS } from '@/lib/fleet-access';
import { Logo, btn } from '@/components/ui';
import { SubmitButton } from '@/components/form-bits';
import { acceptInvite } from '@/app/app/equipe/actions';

export const metadata: Metadata = { title: 'Invitation', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function InvitationPage(props: PageProps<'/invitation/[token]'>) {
  const { token } = await props.params;
  const valid = /^[0-9a-f-]{36}$/.test(token);
  const db = createServiceClient();
  const { data: invite } = valid ? await db.from('fleet_members').select('owner_id, email, role, status').eq('token', token).maybeSingle() : { data: null };
  const { data: owner } = invite ? await db.from('profiles').select('farm_name, full_name').eq('id', invite.owner_id).maybeSingle() : { data: null };
  let loggedIn = false;
  try {
    loggedIn = Boolean(await getSession());
  } catch {
    /* base non configurée */
  }
  const from = (owner?.farm_name || owner?.full_name || 'Une exploitation') as string;
  const suite = encodeURIComponent(`/invitation/${token}`);

  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-ground px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <Logo height={30} />
        {!invite || invite.status !== 'invitation' ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Invitation introuvable</h1>
            <p className="text-muted">Ce lien a déjà servi ou a été annulé. Demandez à la personne qui vous a invité de vous renvoyer une invitation.</p>
            <Link href="/app" className={btn.primary}>Aller à mon espace</Link>
          </>
        ) : (
          <>
            <div>
              <p className="mb-1 text-sm font-bold uppercase tracking-[0.16em] text-brand">Parc partagé</p>
              <h1 className="text-2xl font-bold tracking-tight">{from} vous invite sur son parc matériel</h1>
            </div>
            <p className="text-muted">
              Accès <strong className="text-ink">{ROLE_LABELS[invite.role as 'collaborateur' | 'lecture']}</strong> :{' '}
              {invite.role === 'lecture'
                ? 'vous consultez les machines, leur carnet d’entretien et les prochaines échéances.'
                : 'vous consultez les machines et notez les relevés de compteur et les entretiens.'}{' '}
              Les dépenses et l’abonnement restent privés.
            </p>
            {loggedIn ? (
              <form action={acceptInvite}>
                <input type="hidden" name="token" value={token} />
                <SubmitButton pendingLabel="Un instant…" className="w-full">
                  Accepter l’invitation
                </SubmitButton>
              </form>
            ) : (
              <div className="flex flex-col gap-2.5">
                <Link href={`/inscription?suite=${suite}`} className={btn.primary}>
                  Créer mon compte gratuit
                </Link>
                <Link href={`/connexion?suite=${suite}`} className={btn.secondary}>
                  J’ai déjà un compte
                </Link>
                <p className="text-sm text-muted">Invitation envoyée à {invite.email}.</p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
