import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { hasRecentMfa, requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import { CONTACT_STATUSES, CONTACT_TOPICS, type ContactMessage, type ContactStatus } from '@/lib/contact';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Field, Input, Textarea, btn } from '@/components/ui';
import { Facts, FormActions, Panel, SettingRow } from '../../membres/layout-bits';
import { deleteMessage, replyToMessage, saveMessageNote, setMessageStatus } from '../actions';

export const metadata: Metadata = { title: 'Message' };
export const dynamic = 'force-dynamic';

const TONES: Record<ContactStatus, 'blue' | 'amber' | 'green' | 'gray'> = { nouveau: 'blue', en_cours: 'amber', traite: 'green', archive: 'gray' };
const dateTime = (iso: string) => formatDate(iso, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default async function MessagePage(props: PageProps<'/admin/messages/[id]'>) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { session } = await requireAdmin(`/admin/messages/${id}`);
  const supabase = await createClient();
  const { data } = await supabase.from('contact_messages').select('*').eq('id', id).maybeSingle();
  if (!data) notFound();
  const m = data as ContactMessage;

  // Ouvrir un nouveau message le passe « En cours ».
  if (m.status === 'nouveau') {
    const { createServiceClient } = await import('@/lib/supabase/admin');
    await createServiceClient().from('contact_messages').update({ status: 'en_cours' }).eq('id', m.id).eq('status', 'nouveau');
    m.status = 'en_cours';
  }

  // Compte membre correspondant (par lien direct, sinon par adresse e-mail).
  const { data: member } = m.user_id
    ? await supabase.from('profiles').select('id, full_name, farm_name, plan').eq('id', m.user_id).maybeSingle()
    : await supabase.from('profiles').select('id, full_name, farm_name, plan').ilike('email', m.email).maybeSingle();
  const { count: previous } = await supabase.from('contact_messages').select('id', { count: 'exact', head: true }).ilike('email', m.email).neq('id', m.id);
  const hidden = <input type="hidden" name="id" value={m.id} />;
  const firstName = m.name.trim().split(/\s+/)[0];

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link href="/admin/messages" className="text-sm text-brand">← Tous les messages</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-bold tracking-tight">{CONTACT_TOPICS[m.topic]}</h1>
              <Badge tone={TONES[m.status]}>{CONTACT_STATUSES[m.status]}</Badge>
            </div>
            <p className="text-muted">De {m.name} · reçu le {dateTime(m.created_at)}</p>
          </div>
          <ActionForm action={setMessageStatus} resetOnSuccess={false} className="flex flex-wrap gap-2">
            {hidden}
            {m.status !== 'traite' ? <SubmitButton variant="secondary" name="status" value="traite" pendingLabel="…">Marquer traité</SubmitButton> : <SubmitButton variant="secondary" name="status" value="en_cours" pendingLabel="…">Rouvrir</SubmitButton>}
            {m.status !== 'archive' ? <SubmitButton variant="secondary" name="status" value="archive" pendingLabel="…">Archiver</SubmitButton> : null}
          </ActionForm>
        </div>
      </div>

      <Panel>
        <SettingRow title="Message">
          <p className="whitespace-pre-wrap leading-relaxed">{m.message}</p>
        </SettingRow>
        <SettingRow title="Expéditeur">
          <Facts
            rows={[
              ['Nom', m.name],
              ['E-mail', <a key="e" href={`mailto:${m.email}`} className="text-brand">{m.email}</a>],
              ...(m.phone ? ([['Téléphone', <a key="p" href={`tel:${m.phone.replace(/\s/g, '')}`} className="text-brand">{m.phone}</a>]] as [string, React.ReactNode][]) : []),
              ...(m.farm_name ? ([['Exploitation', m.farm_name]] as [string, string][]) : []),
              ['Compte', member ? <Link key="m" href={`/admin/membres/${member.id}`} className="text-brand">{member.farm_name || member.full_name || 'Voir la fiche membre'} →</Link> : 'pas de compte membre'],
              ['Messages précédents', previous ? <Link key="h" href={`/admin/messages?statut=tous&q=${encodeURIComponent(m.email)}`} className="text-brand">{previous} autre{previous > 1 ? 's' : ''} →</Link> : 'aucun'],
            ]}
          />
        </SettingRow>
        {m.replies?.length ? (
          <SettingRow title="Réponses envoyées">
            <ul className="flex flex-col gap-3">
              {m.replies.map((r, i) => (
                <li key={i} className="rounded-xl bg-ground p-4 text-sm">
                  <p className="mb-1 font-semibold">{r.subject}</p>
                  <p className="mb-2 text-muted">{r.by} · {dateTime(r.at)}</p>
                  <p className="whitespace-pre-wrap">{r.body}</p>
                </li>
              ))}
            </ul>
          </SettingRow>
        ) : null}
        <SettingRow title="Répondre" description={`Envoyé à ${m.email}, aux couleurs du site, avec son message rappelé en dessous. « Bonjour ${firstName}, » et la signature sont ajoutés automatiquement. Sa réponse arrivera sur contact@.`}>
          <ActionForm action={replyToMessage}>
            {hidden}
            <Field label="Objet" htmlFor="subject">
              <Input id="subject" name="subject" required minLength={3} maxLength={150} defaultValue={`Re : ${CONTACT_TOPICS[m.topic]}`} />
            </Field>
            <Field label="Réponse" htmlFor="body" hint="Mise en forme : **gras**, listes avec « - », liens [texte](adresse).">
              <Textarea id="body" name="body" rows={8} required minLength={5} maxLength={10000} />
            </Field>
            <FormActions>
              <label className="mr-auto flex items-center gap-2 text-sm">
                <input type="checkbox" name="mark_done" defaultChecked className="size-4 accent-brand" />
                Marquer comme traité après l’envoi
              </label>
              <SubmitButton pendingLabel="Envoi…">Envoyer la réponse</SubmitButton>
            </FormActions>
          </ActionForm>
        </SettingRow>
        <SettingRow title="Note interne" description="Visible des seuls admins.">
          <ActionForm action={saveMessageNote} resetOnSuccess={false}>
            {hidden}
            <Textarea name="note" rows={3} maxLength={5000} defaultValue={m.admin_note} aria-label="Note interne" />
            <FormActions>
              <SubmitButton variant="secondary" pendingLabel="…">Enregistrer</SubmitButton>
            </FormActions>
          </ActionForm>
        </SettingRow>
        <SettingRow title="Supprimer" description="Efface définitivement ce message (par exemple sur demande de la personne, RGPD)." danger>
          <ActionForm action={deleteMessage} className="flex flex-col gap-2">
            {hidden}
            <FormActions>
              {!hasRecentMfa(session) ? (
                <Link href={`/securite/2fa?forcer=1&suite=${encodeURIComponent(`/admin/messages/${m.id}`)}`} className={`${btn.small} mr-auto`}>Valider mon code d’abord</Link>
              ) : null}
              <SubmitButton variant="danger" pendingLabel="Suppression…">Supprimer</SubmitButton>
            </FormActions>
          </ActionForm>
        </SettingRow>
      </Panel>
    </>
  );
}
