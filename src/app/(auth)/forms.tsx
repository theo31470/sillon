'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-bits';
import { Field, Input } from '@/components/ui';
import { requestPasswordReset, signIn, signUp, updatePassword } from './actions';

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="suite" value={next} />
      <Field label="Adresse e-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Mot de passe" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Connexion…">Se connecter</SubmitButton>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUp, undefined);
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Votre nom" htmlFor="full_name">
        <Input id="full_name" name="full_name" autoComplete="name" required maxLength={120} />
      </Field>
      <Field label="Nom de l’exploitation" htmlFor="farm_name">
        <Input id="farm_name" name="farm_name" autoComplete="organization" required maxLength={120} />
      </Field>
      <Field label="Adresse e-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Mot de passe" htmlFor="password" hint="10 caractères minimum.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <label className="flex items-start gap-3 text-sm text-muted">
        <input type="checkbox" name="consent" required className="mt-1 size-4 accent-brand" />
        <span>
          J’accepte les <Link href="/conditions" className="text-brand underline">conditions d’utilisation</Link> et la{' '}
          <Link href="/confidentialite" className="text-brand underline">politique de confidentialité</Link>.
        </span>
      </label>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Création du compte…">Créer mon compte</SubmitButton>
    </form>
  );
}

export function ResetRequestForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Adresse e-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>Recevoir le lien</SubmitButton>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action] = useActionState(updatePassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Nouveau mot de passe" htmlFor="password" hint="10 caractères minimum.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <Field label="Confirmer le mot de passe" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>Enregistrer</SubmitButton>
    </form>
  );
}
