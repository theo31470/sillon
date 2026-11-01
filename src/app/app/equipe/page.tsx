import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { formatDate } from '@/lib/format';
import { FLEET_GUESTS_LIMIT, getFleetAccess, ROLE_LABELS } from '@/lib/fleet-access';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Card, Field, Input, Notice, Select, btn } from '@/components/ui';
import { changeMemberRole, inviteMember, leaveFleet, removeMember, switchFleet } from './actions';

export const metadata: Metadata = { title: 'Mon équipe' };

type Row = { id: string; owner_id: string; member_id: string | null; email: string; role: 'collaborateur' | 'lecture'; status: 'invitation' | 'actif'; invited_at: string; accepted_at: string | null };

const RIGHTS = {
  collaborateur: 'Voit les machines, note les relevés de compteur et les entretiens.',
  lecture: 'Voit les machines, leur carnet d’entretien et les échéances.',
};

export default async function TeamPage(props: PageProps<'/app/equipe'>) {
  const { session, profile } = await requireUser('/app/equipe');
  const { invitation } = await props.searchParams;
  const supabase = await createClient();
  const [{ data: rows }, access] = await Promise.all([
    supabase.from('fleet_members').select('id, owner_id, member_id, email, role, status, invited_at, accepted_at').order('invited_at'),
    getFleetAccess(),
  ]);
  const all = (rows ?? []) as Row[];
  const mine = all.filter((r) => r.owner_id === session.userId);
  const shared = all.filter((r) => r.member_id === session.userId);
  const memberIds = mine.map((r) => r.member_id).filter(Boolean) as string[];
  const { data: people } = memberIds.length ? await createServiceClient().from('profiles').select('id, full_name, farm_name').in('id', memberIds) : { data: [] };
  const nameOf = (r: Row) => {
    const p = (people ?? []).find((x) => x.id === r.member_id);
    return (p?.full_name || p?.farm_name || r.email) as string;
  };
  const paid = profile.plan !== 'free';
  const left = FLEET_GUESTS_LIMIT - mine.length;

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mon équipe</h1>
        <p className="max-w-3xl text-muted">
          Partagez votre parc avec un salarié, un associé ou votre mécanicien : chacun note ses relevés et ses entretiens depuis son téléphone, et vous retrouvez tout au même
          endroit. Les dépenses, le coût de revient et l’abonnement restent visibles par vous seul.
        </p>
      </div>
      {invitation === 'invalide' ? <Notice tone="red">Cette invitation n’est plus valable (déjà utilisée ou annulée).</Notice> : null}
      {invitation === 'deja' ? <Notice>Vous avez déjà accès à ce parc.</Notice> : null}

      <div className="flex flex-wrap items-start gap-5">
        <Card className="min-w-0 flex-[2_1_520px]">
          <h2 className="mb-1 text-xl font-semibold">Accès à mon parc</h2>
          <p className="mb-4 text-sm text-muted">
            {paid ? `Formule Complet : jusqu’à ${FLEET_GUESTS_LIMIT} personnes en plus de vous.` : 'Le partage du parc est inclus dans la formule Complet.'}
          </p>
          {mine.length === 0 ? (
            <p className="rounded-xl bg-ground px-4 py-3 text-sm text-muted">Personne pour le moment.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {mine.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span className="min-w-0 flex-[1_1_220px]">
                    <span className="block truncate font-semibold">{r.status === 'actif' ? nameOf(r) : r.email}</span>
                    <span className="text-sm text-muted">
                      {r.status === 'actif' ? `${r.email} · depuis le ${formatDate(r.accepted_at ?? r.invited_at)}` : `Invitation envoyée le ${formatDate(r.invited_at)}`}
                    </span>
                  </span>
                  {r.status === 'invitation' ? <Badge tone="amber">En attente</Badge> : null}
                  <form action={changeMemberRole} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <label className="sr-only" htmlFor={`role-${r.id}`}>Droits de {r.email}</label>
                    <Select id={`role-${r.id}`} name="role" defaultValue={r.role} className="min-h-10! w-auto! py-1.5! text-sm">
                      <option value="collaborateur">{ROLE_LABELS.collaborateur}</option>
                      <option value="lecture">{ROLE_LABELS.lecture}</option>
                    </Select>
                    <button type="submit" className={btn.small}>Changer</button>
                  </form>
                  <form action={removeMember}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="text-sm font-semibold text-danger hover:underline">{r.status === 'actif' ? 'Retirer l’accès' : 'Annuler'}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="min-w-0 flex-[1_1_300px]">
          <h2 className="mb-3 text-xl font-semibold">Inviter quelqu’un</h2>
          {!paid ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">Passez à la formule Complet pour partager votre parc avec {FLEET_GUESTS_LIMIT} personnes.</p>
              <Link href="/app/abonnement" className={btn.primary}>Découvrir la formule Complet</Link>
            </div>
          ) : left <= 0 ? (
            <p className="text-sm text-muted">Vous avez invité {FLEET_GUESTS_LIMIT} personnes, le maximum de la formule Complet. Retirez un accès pour en inviter une autre.</p>
          ) : (
            <ActionForm action={inviteMember}>
              <Field label="Adresse e-mail" htmlFor="inv-email">
                <Input id="inv-email" name="email" type="email" required autoComplete="off" placeholder="prenom@exemple.fr" />
              </Field>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-semibold">Droits</legend>
                {(['collaborateur', 'lecture'] as const).map((r) => (
                  <label key={r} className="flex cursor-pointer gap-3 rounded-xl border border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-tint">
                    <input type="radio" name="role" value={r} defaultChecked={r === 'collaborateur'} className="mt-1 size-4 accent-[var(--color-brand)]" />
                    <span>
                      <span className="block font-semibold">{ROLE_LABELS[r]}</span>
                      <span className="text-sm text-muted">{RIGHTS[r]}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <SubmitButton pendingLabel="Envoi…">Envoyer l’invitation</SubmitButton>
              <p className="text-xs text-muted">La personne reçoit un lien par e-mail et crée son compte gratuit si elle n’en a pas.</p>
            </ActionForm>
          )}
        </Card>
      </div>

      {shared.length ? (
        <Card>
          <h2 className="mb-3 text-xl font-semibold">Parcs partagés avec moi</h2>
          <ul className="divide-y divide-line-soft">
            {shared.map((r) => {
              const f = access?.fleets.find((x) => x.ownerId === r.owner_id);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span className="min-w-0 flex-[1_1_220px]">
                    <span className="block font-semibold">{f?.label ?? 'Parc partagé'}</span>
                    <span className="text-sm text-muted">{f ? ROLE_LABELS[r.role] : 'Suspendu : la formule Complet du titulaire n’est plus active'}</span>
                  </span>
                  {f ? (
                    <form action={switchFleet}>
                      <input type="hidden" name="owner" value={r.owner_id} />
                      <button type="submit" className={btn.small}>
                        {access?.current.ownerId === r.owner_id ? 'Parc affiché' : 'Afficher ce parc'}
                      </button>
                    </form>
                  ) : null}
                  <form action={leaveFleet}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="text-sm font-semibold text-danger hover:underline">Quitter</button>
                  </form>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
