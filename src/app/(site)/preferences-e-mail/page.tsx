import Link from 'next/link';
import type { Metadata } from 'next';
import { maskEmail, prefsByToken } from '@/lib/email/preferences';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { EmailPrefsFields } from '@/components/email-prefs-fields';
import { Card, btn } from '@/components/ui';
import { savePrefs } from './actions';

export const metadata: Metadata = { title: 'Mes e-mails', robots: { index: false } };

/** Préférences d'e-mail accessibles depuis le lien en bas de chaque rappel ou annonce, sans connexion. */
export default async function EmailPrefsPage(props: PageProps<'/preferences-e-mail'>) {
  const { t, liste } = await props.searchParams;
  const token = typeof t === 'string' ? t : null;
  const prefs = token ? await prefsByToken(token) : null;

  return (
    <section className="mx-auto w-full max-w-xl px-4 py-14">
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-brand">Mes e-mails</p>
      <h1 className="mb-6 text-4xl font-extrabold tracking-tight">Choisissez ce que vous recevez</h1>
      {prefs ? (
        <Card>
          <p className="mb-5 text-muted">
            Adresse : <strong className="text-ink">{maskEmail(prefs.email)}</strong>
            {liste === 'rappels' || liste === 'annonces' ? (
              <> · décochez « {liste === 'rappels' ? 'Rappels d’entretien' : 'Nouveautés et conseils'} » puis enregistrez.</>
            ) : null}
          </p>
          <ActionForm action={savePrefs} resetOnSuccess={false}>
            <input type="hidden" name="t" value={token ?? ''} />
            <EmailPrefsFields reminders={prefs.email_reminders} news={prefs.email_news} />
            <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
          </ActionForm>
        </Card>
      ) : (
        <Card>
          <p className="mb-4 text-muted">Ce lien n’est pas (ou plus) valable. Connectez-vous pour régler vos e-mails depuis votre compte.</p>
          <Link href="/connexion?suite=/app/compte" className={btn.primary}>Me connecter</Link>
        </Card>
      )}
    </section>
  );
}
