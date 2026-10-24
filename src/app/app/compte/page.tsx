import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Card, Field, Input, btn } from '@/components/ui';
import { NewPasswordForm } from '@/app/(auth)/forms';
import { deleteOwnAccount, updateProfile } from './actions';

export const metadata: Metadata = { title: 'Mon compte' };

export default async function AccountPage() {
  const { session, profile } = await requireUser('/app/compte');

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Mon compte</h1>
      <div className="flex flex-wrap items-start gap-6">
        <Card className="min-w-0 flex-[1_1_420px]">
          <h2 className="mb-4 text-xl font-semibold">Mes informations</h2>
          <ActionForm action={updateProfile} resetOnSuccess={false}>
            <Field label="Nom" htmlFor="full_name">
              <Input id="full_name" name="full_name" defaultValue={profile.full_name} required maxLength={120} />
            </Field>
            <Field label="Exploitation" htmlFor="farm_name">
              <Input id="farm_name" name="farm_name" defaultValue={profile.farm_name} maxLength={120} />
            </Field>
            <p className="text-sm text-muted">E-mail : {profile.email}</p>
            <SubmitButton>Enregistrer</SubmitButton>
          </ActionForm>
        </Card>

        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-6">
          <Card>
            <h2 className="mb-4 text-xl font-semibold">Mot de passe</h2>
            <NewPasswordForm />
          </Card>
          <Card>
            <h2 className="mb-2 text-xl font-semibold">Double authentification</h2>
            <p className="mb-4 text-muted">
              {session.aal === 'aal2'
                ? 'Activée : un code vous est demandé à la connexion.'
                : 'Protégez votre compte avec un code à 6 chiffres sur votre téléphone (recommandé).'}
            </p>
            {session.aal !== 'aal2' ? <Link href="/securite/2fa?suite=/app/compte" className={btn.secondary}>Activer</Link> : null}
          </Card>
          <Card>
            <h2 className="mb-2 text-xl font-semibold">Mes données</h2>
            <p className="mb-4 text-muted">Téléchargez toutes vos données (machines, relevés, entretiens, dépenses) au format JSON.</p>
            <a href="/api/compte/export" className={btn.secondary} download>Télécharger mes données</a>
            <details className="mt-6 rounded-xl border border-[#e3b7b0] p-4">
              <summary className="cursor-pointer font-semibold text-danger">Supprimer mon compte</summary>
              <p className="my-3 text-sm text-muted">
                Suppression définitive de votre compte et de toutes vos données. Votre abonnement est résilié. Cette action est irréversible.
              </p>
              <ActionForm action={deleteOwnAccount}>
                <Field label="Tapez SUPPRIMER pour confirmer" htmlFor="confirm">
                  <Input id="confirm" name="confirm" autoComplete="off" required />
                </Field>
                <SubmitButton variant="danger" pendingLabel="Suppression…">Supprimer définitivement</SubmitButton>
              </ActionForm>
            </details>
          </Card>
        </div>
      </div>
    </>
  );
}
