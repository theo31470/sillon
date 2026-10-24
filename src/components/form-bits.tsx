'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import { btn } from '@/components/ui';

/** Bouton d'envoi qui se désactive pendant l'envoi du formulaire. */
export function SubmitButton({
  children,
  pendingLabel = 'Envoi…',
  variant = 'primary',
  className = '',
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: keyof typeof btn;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btn[variant]} ${className}`}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export type FormState = { ok?: boolean; error?: string; message?: string } | undefined;

export function FormMessage({ state }: { state: FormState }) {
  if (!state) return null;
  if (state.error) {
    return (
      <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="rounded-[10px] bg-brand-tint px-4 py-3 text-sm text-brand-dark">
        {state.message}
      </p>
    );
  }
  return null;
}
