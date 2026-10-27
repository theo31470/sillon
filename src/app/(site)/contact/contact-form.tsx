'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { SubmitButton } from '@/components/form-bits';
import { Field, Input, Select, Textarea } from '@/components/ui';
import { CONTACT_TOPICS } from '@/lib/contact';
import { sendContactMessage } from './actions';

export function ContactForm({ defaults }: { defaults: { name: string; email: string; farm_name: string; topic: string } }) {
  const [state, action] = useActionState(sendContactMessage, undefined);
  // Heure d'ouverture du formulaire (anti-robots : un humain met plus de 3 secondes).
  const [startedAt] = useState(() => Date.now());
  const v = { ...defaults, phone: '', message: '', ...(state?.fields ?? {}) };

  if (state?.ok) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-8 text-center">
        <p className="text-2xl font-bold">Merci, message envoyé !</p>
        <p className="text-muted">Nous vous répondons en général sous 2 jours ouvrés. Un e-mail de confirmation vient de vous être envoyé.</p>
        <p>
          <Link href="/" className="font-semibold text-brand">Retour à l’accueil</Link>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <input type="hidden" name="t" value={startedAt} />
      {/* Champ piège pour les robots : invisible pour les personnes. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Site web</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nom et prénom" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" required minLength={2} maxLength={120} defaultValue={v.name} />
        </Field>
        <Field label="Adresse e-mail" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={v.email} />
        </Field>
        <Field label="Exploitation (facultatif)" htmlFor="farm_name">
          <Input id="farm_name" name="farm_name" autoComplete="organization" maxLength={120} defaultValue={v.farm_name} />
        </Field>
        <Field label="Téléphone (facultatif)" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={40} defaultValue={v.phone} />
        </Field>
      </div>
      <Field label="Sujet" htmlFor="topic">
        <Select id="topic" name="topic" defaultValue={v.topic}>
          {Object.entries(CONTACT_TOPICS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </Select>
      </Field>
      <Field label="Votre message" htmlFor="message" hint="Pour une machine, précisez la marque, le modèle et l’année.">
        <Textarea id="message" name="message" rows={7} required minLength={10} maxLength={5000} defaultValue={v.message} />
      </Field>
      <label className="flex items-start gap-3 text-sm text-muted">
        <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0 accent-brand" />
        <span>
          J’accepte que Tracteurs &amp; Co utilise ces informations pour me répondre. Elles sont conservées 3 ans au plus (voir la{' '}
          <Link href="/confidentialite" className="underline">politique de confidentialité</Link>).
        </span>
      </label>
      {state?.error ? <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{state.error}</p> : null}
      <div>
        <SubmitButton pendingLabel="Envoi…">Envoyer le message</SubmitButton>
      </div>
    </form>
  );
}
