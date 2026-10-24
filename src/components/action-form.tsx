'use client';

import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import { FormMessage, type FormState } from '@/components/form-bits';

/**
 * Formulaire relié à une action serveur : affiche le message de retour
 * et se vide après un succès.
 */
export function ActionForm({
  action,
  children,
  className = 'flex flex-col gap-4',
  resetOnSuccess = true,
  id,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className} id={id}>
      {children}
      <FormMessage state={state} />
    </form>
  );
}
