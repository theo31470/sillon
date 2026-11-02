'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SubmitButton } from '@/components/form-bits';
import { replyMessage } from '../actions';

export function ReplyBox({ conversationId }: { conversationId: string }) {
  const [state, action] = useActionState(replyMessage, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      form.current?.reset();
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  }, [state]);
  return (
    <form ref={form} action={action} className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3 shadow-lg md:bottom-4">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <label htmlFor="reply" className="sr-only">Votre message</label>
      <textarea
        id="reply"
        name="body"
        rows={2}
        required
        maxLength={2000}
        placeholder="Votre message…"
        className="w-full resize-y rounded-[10px] border border-field bg-surface px-3.5 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) form.current?.requestSubmit();
        }}
      />
      {state?.error ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
      <SubmitButton pendingLabel="Envoi…" className="self-end">Envoyer</SubmitButton>
    </form>
  );
}

/** Nouveaux messages : la conversation se met à jour toute seule tant qu'elle est ouverte. */
export function AutoRefresh({ every = 20_000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}
