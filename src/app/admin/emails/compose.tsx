'use client';

import { useActionState, useDeferredValue, useMemo, useState } from 'react';
import { campaignEmail } from '@/lib/email/templates';
import { FormMessage, SubmitButton } from '@/components/form-bits';
import { EmailPreview } from '@/components/email-preview';
import { Field, Input, Select, Textarea } from '@/components/ui';
import { sendCampaign, sendTestCampaign } from './actions';

const AUDIENCE_LABELS = { tous: 'Tous les membres', gratuits: 'Formule gratuite', payants: 'Abonnés payants' } as const;
type Audience = keyof typeof AUDIENCE_LABELS;

const STARTER = `Nous avons ajouté une nouveauté sur Tracteurs & Co :

## Ce qui change

- premier point ;
- deuxième point.

Pour l’essayer, ouvrez [votre parc matériel](/app/materiel).`;

export function Compose({ siteUrl, counts, previewName }: { siteUrl: string; counts: Record<Audience, number>; previewName: string }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState(STARTER);
  const [audience, setAudience] = useState<Audience>('tous');
  const [narrow, setNarrow] = useState(false);
  const [testState, testAction] = useActionState(sendTestCampaign, undefined);
  const [sendState, sendAction] = useActionState(sendCampaign, undefined);

  const deferredSubject = useDeferredValue(subject);
  const deferredBody = useDeferredValue(body);
  const preview = useMemo(
    () => campaignEmail({ subject: deferredSubject || 'Objet de votre annonce', bodyMd: deferredBody || '…', name: previewName, preferencesUrl: `${siteUrl}/preferences-e-mail` }, siteUrl).html,
    [deferredSubject, deferredBody, previewName, siteUrl],
  );
  const total = counts[audience];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form className="flex min-w-0 flex-col gap-4">
        <Field label="Objet" htmlFor="subject">
          <Input id="subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} required placeholder="Nouveau : le coût de revient par machine" />
        </Field>
        <Field label="Message" htmlFor="body" hint="Mise en forme : ## titre, - liste, **gras**, *italique*, [lien](/app). « Bonjour Prénom, » est ajouté automatiquement.">
          <Textarea id="body" name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={14} maxLength={20000} required className="font-mono text-sm" />
        </Field>
        <Field label="Destinataires" htmlFor="audience">
          <Select id="audience" name="audience" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
            {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
              <option key={a} value={a}>
                {AUDIENCE_LABELS[a]} ({counts[a]})
              </option>
            ))}
          </Select>
        </Field>
        <p className="-mt-2 text-sm text-muted">Seuls les membres actifs qui acceptent les « nouveautés » sont comptés.</p>

        <div className="flex flex-wrap gap-3">
          <SubmitButton variant="secondary" pendingLabel="Envoi du test…" formAction={testAction}>M’envoyer un test</SubmitButton>
        </div>
        <FormMessage state={testState} />

        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <label className="mb-3 flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" name="confirm" className="mt-0.5 size-4 accent-brand" />
            <span>
              J’ai relu le test et je confirme l’envoi à <strong>{total} membre{total > 1 ? 's' : ''}</strong>. Un envoi ne peut pas être annulé.
            </span>
          </label>
          <SubmitButton pendingLabel="Lancement…" formAction={sendAction}>Envoyer l’annonce</SubmitButton>
        </div>
        <FormMessage state={sendState} />
      </form>

      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-muted">Aperçu</p>
          <div className="flex gap-1 rounded-lg border border-line p-0.5 text-xs">
            {[
              ['Ordinateur', false],
              ['Mobile', true],
            ].map(([label, value]) => (
              <button
                key={String(label)}
                type="button"
                onClick={() => setNarrow(value as boolean)}
                className={`rounded-md px-2.5 py-1 font-semibold ${narrow === value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[760px] overflow-auto rounded-2xl border border-line bg-[#efebe5]">
          <EmailPreview html={preview} className={`mx-auto transition-[width] duration-300 ${narrow ? 'w-[375px] max-w-full' : 'w-full'}`} />
        </div>
      </div>
    </div>
  );
}
