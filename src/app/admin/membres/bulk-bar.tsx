'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormMessage, SubmitButton } from '@/components/form-bits';
import { Field, Input, Select, Textarea } from '@/components/ui';
import { bulkMembers } from './actions';

const FORM_ID = 'bulk-form';
const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${FORM_ID}"]`));

/** Case « tout sélectionner » de l'en-tête du tableau. */
export function SelectAll() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const sync = () => {
      const all = boxes();
      const n = all.filter((b) => b.checked).length;
      if (!ref.current) return;
      ref.current.checked = n > 0 && n === all.length;
      ref.current.indeterminate = n > 0 && n < all.length;
    };
    document.addEventListener('change', sync);
    return () => document.removeEventListener('change', sync);
  }, []);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Tout sélectionner sur cette page"
      className="size-4 accent-brand"
      onChange={(e) => {
        for (const b of boxes()) b.checked = e.target.checked;
        document.dispatchEvent(new Event('change'));
      }}
    />
  );
}

/** Case d'une ligne, rattachée au formulaire des actions groupées. */
export function RowCheckbox({ id, label }: { id: string; label: string }) {
  return <input type="checkbox" name="ids" value={id} form={FORM_ID} aria-label={`Sélectionner ${label}`} className="size-4 accent-brand" />;
}

export function BulkBar({ tags }: { tags: string[] }) {
  const [state, formAction] = useActionState(bulkMembers, undefined);
  const [count, setCount] = useState(0);
  const [action, setAction] = useState('tag_add');
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const sync = () => setCount(boxes().filter((b) => b.checked).length);
    document.addEventListener('change', sync);
    sync();
    return () => document.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!state?.ok) return;
    for (const b of boxes()) b.checked = false;
    document.dispatchEvent(new Event('change'));
    formRef.current?.reset();
    router.refresh();
  }, [state, router]);

  return (
    <form
      ref={formRef}
      id={FORM_ID}
      action={formAction}
      className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 ${count ? 'border-brand bg-brand-tint' : 'border-dashed border-line'}`}
    >
      {count ? (
        <>
          <div className="grid items-end gap-3 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <p className="pb-3 font-semibold">
              {count} sélectionné{count > 1 ? 's' : ''}
            </p>
            <Field label="Action groupée" htmlFor="bulk_action">
              <Select id="bulk_action" name="bulk_action" value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="tag_add">Ajouter une étiquette</option>
                <option value="tag_remove">Retirer une étiquette</option>
                <option value="message">Envoyer un e-mail</option>
                <option value="suspend">Suspendre</option>
                <option value="reactivate">Réactiver</option>
              </Select>
            </Field>
            {action === 'tag_add' || action === 'tag_remove' ? (
              <div>
                <Field label="Étiquette" htmlFor="bulk_tag">
                  <Input id="bulk_tag" name="tag" list="bulk-tags" autoComplete="off" required />
                </Field>
                <datalist id="bulk-tags">
                  {tags.map((t) => <option key={t} value={t} />)}
                </datalist>
              </div>
            ) : (
              <span />
            )}
            {action !== 'message' ? (
              <SubmitButton variant={action === 'suspend' ? 'danger' : 'primary'} pendingLabel="…">
                Appliquer
              </SubmitButton>
            ) : (
              <span />
            )}
          </div>
          {action === 'message' ? (
            <div className="flex flex-col gap-3 border-t border-line pt-3">
              <Field label="Objet" htmlFor="bulk_subject">
                <Input id="bulk_subject" name="subject" required minLength={3} maxLength={150} />
              </Field>
              <Field label="Message" htmlFor="bulk_body" hint="« Bonjour [prénom], » et la signature sont ajoutés pour chacun. Mise en forme : **gras**, listes avec « - ».">
                <Textarea id="bulk_body" name="body" rows={6} required minLength={10} maxLength={10000} />
              </Field>
              <div className="flex justify-end">
                <SubmitButton pendingLabel="Envoi…">Envoyer à {count} membre{count > 1 ? 's' : ''}</SubmitButton>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted">Cochez des membres dans le tableau pour les étiqueter, leur écrire ou les suspendre en une fois.</p>
      )}
      <FormMessage state={state} />
    </form>
  );
}

/** Liste déroulante qui applique le filtre dès qu'on la change. */
export function AutoSubmitSelect(props: React.ComponentProps<'select'>) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
