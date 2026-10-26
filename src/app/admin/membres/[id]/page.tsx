import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { hasRecentMfa, requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { formatDate, formatEuros } from '@/lib/format';
import { DIAGNOSTIC_MONTHLY_LIMIT, PLANS } from '@/lib/plans';
import { diagnosticQuota, parisMonthStart } from '@/lib/diagnostic-quota';
import type { MemberAdmin, Payment, Profile, Subscription } from '@/lib/types';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Card, Field, Input, Notice, Select, Textarea, btn } from '@/components/ui';
import {
  deleteMember,
  extendTrial,
  grantComp,
  manageSubscription,
  refundLastPayment,
  revokeComp,
  saveAdminNote,
  sendMemberMessage,
  sendResetLink,
  setDiagnosticQuota,
  setRole,
  toggleSuspension,
  updateMemberInfo,
} from '../actions';

export const metadata: Metadata = { title: 'Fiche membre' };
export const dynamic = 'force-dynamic';

const SUB_LABELS: Record<string, string> = {
  trialing: 'Essai gratuit',
  active: 'Actif',
  past_due: 'Paiement en retard',
  unpaid: 'Impayé',
  canceled: 'Résilié',
  incomplete: 'Incomplet',
  incomplete_expired: 'Expiré',
};
const EMAIL_KINDS: Record<string, string> = { compte: 'Compte', rappel: 'Rappel', annonce: 'Annonce', test: 'Test', facturation: 'Abonnement', message: 'Message' };
const dateTime = (iso: string | null | undefined) => (iso ? formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const longDate = (iso: string) => formatDate(iso, { day: 'numeric', month: 'long', year: 'numeric' });

/** Action du journal en clair (« membre.essai_prolonge » → « essai prolongé »). */
const actionLabel = (a: string) => a.replace(/^membres?\./, '').replace(/_/g, ' ');

export default async function MemberPage(props: PageProps<'/admin/membres/[id]'>) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { session } = await requireAdmin(`/admin/membres/${id}`);
  const supabase = await createClient();
  const service = createServiceClient();

  const { data: p } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (!p) notFound();
  const member = p as Profile;

  const [subsRes, paymentsRes, fileRes, emailsRes, auditRes, machines, logs, aiRes, authRes, tagsRes, quota] = await Promise.all([
    supabase.from('subscriptions').select('*').eq('user_id', id).order('created_at', { ascending: false }),
    supabase.from('payments').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(6),
    supabase.from('member_admin').select('*').eq('user_id', id).maybeSingle(),
    supabase.from('email_log').select('id, kind, subject, status, created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(8),
    supabase.from('audit_log').select('id, actor_email, action, details, created_at').eq('target_id', id).order('created_at', { ascending: false }).limit(10),
    service.from('machines').select('id', { count: 'exact', head: true }).eq('user_id', id),
    service.from('maintenance_logs').select('id', { count: 'exact', head: true }).eq('user_id', id),
    service.from('ai_usage').select('feature, cost_usd').eq('user_id', id).gte('created_at', parisMonthStart().toISOString()),
    service.auth.admin.getUserById(id),
    service.rpc('admin_member_tags'),
    diagnosticQuota(id),
  ]);
  const subs = (subsRes.data ?? []) as Subscription[];
  const sub = subs.find((s) => ['trialing', 'active', 'past_due', 'unpaid'].includes(s.status)) ?? subs[0] ?? null;
  const subRunning = Boolean(sub && ['trialing', 'active', 'past_due', 'unpaid'].includes(sub.status));
  const payments = (paymentsRes.data ?? []) as Payment[];
  const file = (fileRes.data ?? null) as MemberAdmin | null;
  const authUser = authRes.data?.user ?? null;
  const mfaOn = (authUser?.factors ?? []).some((f) => f.status === 'verified');
  const ai = aiRes.data ?? [];
  const aiCost = ai.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const allTags = ((tagsRes.data ?? []) as { tag: string }[]).map((t) => t.tag);
  const refundable = payments.find((x) => x.status === 'paid' && x.amount_cents > 0);
  const self = member.id === session.userId;
  const recentMfa = hasRecentMfa(session);
  const compRunning = member.comp_active && (!member.comp_until || new Date(member.comp_until) > new Date());
  const hidden = <input type="hidden" name="user_id" value={member.id} />;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/admin/membres" className="text-sm text-brand">← Membres</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-bold tracking-tight">{member.farm_name || member.full_name || member.email}</h1>
          <Badge tone={member.plan === 'free' ? 'gray' : 'green'}>{PLANS[member.plan].name}</Badge>
          {compRunning ? <Badge tone="blue">Offerte</Badge> : null}
          {sub && subRunning ? <Badge tone={sub.status === 'past_due' || sub.status === 'unpaid' ? 'red' : sub.cancel_at_period_end ? 'amber' : 'green'}>{sub.cancel_at_period_end ? 'Résiliation programmée' : SUB_LABELS[sub.status] ?? sub.status}</Badge> : null}
          {member.suspended ? <Badge tone="red">Suspendu</Badge> : null}
          {member.role === 'admin' ? <Badge tone="amber">Admin</Badge> : null}
          {(file?.tags ?? []).map((t) => (
            <Link key={t} href={`/admin/membres?etiquette=${encodeURIComponent(t)}`} className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-muted hover:border-brand">
              #{t}
            </Link>
          ))}
        </div>
        <p className="text-muted">
          {member.full_name || '—'} · {member.email} · membre depuis le {longDate(member.created_at)}
        </p>
      </div>

      {!recentMfa ? (
        <Notice>
          Certaines actions (suspension, remboursement, résiliation immédiate, changement d’e-mail, suppression) demandent un code récent :{' '}
          <Link href={`/securite/2fa?forcer=1&suite=${encodeURIComponent(`/admin/membres/${member.id}`)}`} className="font-semibold underline">
            validez à nouveau votre code
          </Link>{' '}
          (valable 15 min).
        </Notice>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Abonnement */}
          <Card className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Abonnement</h2>
                {sub ? (
                  <p className="text-sm text-muted">
                    Stripe : {SUB_LABELS[sub.status] ?? sub.status}
                    {sub.current_period_end ? ` · ${sub.cancel_at_period_end ? 'se termine le' : sub.status === 'trialing' ? 'fin d’essai le' : 'prochain paiement le'} ${longDate(sub.current_period_end)}` : ''}
                  </p>
                ) : (
                  <p className="text-sm text-muted">Aucun abonnement Stripe.</p>
                )}
                {compRunning ? (
                  <p className="text-sm text-info">Formule Complet offerte {member.comp_until ? `jusqu’au ${longDate(member.comp_until)}` : 'sans date de fin'}.</p>
                ) : null}
              </div>
              {member.stripe_customer_id ? (
                <a href={`https://dashboard.stripe.com/customers/${member.stripe_customer_id}`} target="_blank" rel="noopener noreferrer" className={btn.small}>
                  Voir dans Stripe ↗
                </a>
              ) : null}
            </div>

            {subRunning ? (
              <div className="grid gap-4 md:grid-cols-2">
                <ActionForm action={extendTrial} className="flex flex-col gap-2 rounded-xl bg-ground p-4">
                  {hidden}
                  <p className="font-semibold">Offrir des jours</p>
                  <p className="text-sm text-muted">Repousse le prochain paiement (prolonge l’essai, ou en ajoute un).</p>
                  <div className="flex gap-2">
                    <Select name="jours" defaultValue="30" aria-label="Nombre de jours" className="max-w-36">
                      {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} jours</option>)}
                    </Select>
                    <SubmitButton variant="secondary" pendingLabel="…">Offrir</SubmitButton>
                  </div>
                </ActionForm>
                <ActionForm action={manageSubscription} resetOnSuccess={false} className="flex flex-col gap-2 rounded-xl bg-ground p-4">
                  {hidden}
                  <p className="font-semibold">Résiliation</p>
                  <p className="text-sm text-muted">En fin de période, l’accès reste ouvert jusqu’à l’échéance.</p>
                  <div className="flex flex-wrap gap-2">
                    {sub?.cancel_at_period_end ? (
                      <SubmitButton variant="secondary" name="mode" value="reprendre" pendingLabel="…">Annuler la résiliation</SubmitButton>
                    ) : (
                      <SubmitButton variant="secondary" name="mode" value="fin" pendingLabel="…">Résilier en fin de période</SubmitButton>
                    )}
                    <SubmitButton variant="danger" name="mode" value="immediat" pendingLabel="…">Résilier maintenant</SubmitButton>
                  </div>
                </ActionForm>
              </div>
            ) : null}

            {refundable ? (
              <ActionForm action={refundLastPayment} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4">
                {hidden}
                <div>
                  <p className="font-semibold">Rembourser le dernier paiement</p>
                  <p className="text-sm text-muted">{formatEuros(refundable.amount_cents, refundable.currency)} du {longDate(refundable.created_at)}, remboursé en totalité.</p>
                </div>
                <SubmitButton variant="danger" pendingLabel="Remboursement…">Rembourser</SubmitButton>
              </ActionForm>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <ActionForm action={grantComp} className="flex flex-col gap-2 rounded-xl border border-line p-4">
                {hidden}
                <p className="font-semibold">{compRunning ? 'Prolonger la formule offerte' : 'Offrir la formule Complet'}</p>
                <p className="text-sm text-muted">Sans carte ni Stripe : partenaire, testeur, geste commercial.</p>
                <Select name="duree" defaultValue="3" aria-label="Durée">
                  <option value="1">1 mois</option>
                  <option value="3">3 mois</option>
                  <option value="6">6 mois</option>
                  <option value="12">1 an</option>
                  <option value="date">Jusqu’à une date…</option>
                  <option value="illimite">Sans date de fin</option>
                </Select>
                <Input type="date" name="date" aria-label="Date de fin (si « jusqu’à une date »)" />
                <SubmitButton variant="secondary" pendingLabel="…">{compRunning ? 'Prolonger' : 'Offrir'}</SubmitButton>
              </ActionForm>
              <div className="flex flex-col gap-3">
                {compRunning ? (
                  <ActionForm action={revokeComp} className="flex flex-col gap-2 rounded-xl border border-line p-4">
                    {hidden}
                    <p className="font-semibold">Retirer la formule offerte</p>
                    <SubmitButton variant="danger" pendingLabel="…">Retirer</SubmitButton>
                  </ActionForm>
                ) : null}
                <ActionForm action={setDiagnosticQuota} resetOnSuccess={false} className="flex flex-col gap-2 rounded-xl border border-line p-4">
                  {hidden}
                  <p className="font-semibold">Quota de diagnostics</p>
                  <p className="text-sm text-muted">
                    Ce mois-ci : {quota.usedMonth} / {quota.limit}. Vide = quota normal ({DIAGNOSTIC_MONTHLY_LIMIT}).
                  </p>
                  <div className="flex gap-2">
                    <Input name="limit" type="number" min={0} max={1000} defaultValue={file?.diag_monthly_limit ?? ''} placeholder={String(DIAGNOSTIC_MONTHLY_LIMIT)} aria-label="Diagnostics par mois" className="max-w-32" />
                    <SubmitButton variant="secondary" pendingLabel="…">Enregistrer</SubmitButton>
                  </div>
                </ActionForm>
              </div>
            </div>

            {payments.length ? (
              <div>
                <h3 className="mb-1.5 text-[15px] font-semibold">Derniers paiements</h3>
                <ul className="text-sm">
                  {payments.map((x) => (
                    <li key={x.id} className="flex justify-between gap-3 border-b border-line-soft py-2">
                      <span>{longDate(x.created_at)}</span>
                      <span className="flex items-center gap-2">
                        {formatEuros(x.amount_cents, x.currency)}
                        {x.status === 'paid' ? <Badge tone="green">Payé</Badge> : x.status === 'refunded' ? <Badge>Remboursé</Badge> : <Badge tone="red">Échec</Badge>}
                        {x.hosted_invoice_url ? <a href={x.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="text-brand">Facture</a> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          {/* Activité */}
          <Card className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold">Activité</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted">Dernière activité</dt><dd>{dateTime(member.last_seen_at)}</dd>
              <dt className="text-muted">Dernière connexion</dt><dd>{dateTime(authUser?.last_sign_in_at)}</dd>
              <dt className="text-muted">E-mail confirmé</dt><dd>{authUser?.email_confirmed_at ? `oui, le ${longDate(authUser.email_confirmed_at)}` : 'non'}</dd>
              <dt className="text-muted">Double authentification</dt><dd>{mfaOn ? 'activée' : 'non activée'}</dd>
              <dt className="text-muted">Parc</dt><dd>{machines.count ?? 0} machine{(machines.count ?? 0) > 1 ? 's' : ''} · {logs.count ?? 0} entretien{(logs.count ?? 0) > 1 ? 's' : ''} noté{(logs.count ?? 0) > 1 ? 's' : ''}</dd>
              <dt className="text-muted">IA ce mois-ci</dt>
              <dd>
                {ai.filter((r) => r.feature === 'diagnostic').length} diagnostic{ai.filter((r) => r.feature === 'diagnostic').length > 1 ? 's' : ''} · coût {aiCost.toLocaleString('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 3 })}
              </dd>
              <dt className="text-muted">Préférences e-mail</dt><dd>rappels {member.email_reminders ? 'oui' : 'non'} · annonces {member.email_news ? 'oui' : 'non'}</dd>
            </dl>

            <div>
              <h3 className="mb-1.5 text-[15px] font-semibold">E-mails reçus</h3>
              {(emailsRes.data ?? []).length ? (
                <ul className="text-sm">
                  {(emailsRes.data ?? []).map((e) => (
                    <li key={e.id} className="flex justify-between gap-3 border-b border-line-soft py-2">
                      <span className="min-w-0 truncate" title={e.subject}>
                        <span className="text-muted">{EMAIL_KINDS[e.kind] ?? e.kind} · </span>
                        {e.subject}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-muted">
                        {dateTime(e.created_at)}
                        {e.status === 'sent' ? null : <Badge tone="red">Échec</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Aucun e-mail envoyé.</p>
              )}
            </div>

            <div>
              <h3 className="mb-1.5 text-[15px] font-semibold">Actions des admins sur ce compte</h3>
              {(auditRes.data ?? []).length ? (
                <ul className="text-sm">
                  {(auditRes.data ?? []).map((a) => (
                    <li key={a.id} className="flex justify-between gap-3 border-b border-line-soft py-2">
                      <span className="first-letter:uppercase">{actionLabel(a.action)}</span>
                      <span className="shrink-0 text-muted">{a.actor_email ?? 'système'} · {dateTime(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Aucune action enregistrée.</p>
              )}
            </div>
          </Card>

          {/* Message */}
          <Card>
            <h2 className="mb-1 text-xl font-semibold">Lui écrire</h2>
            <p className="mb-4 text-sm text-muted">E-mail aux couleurs du site, envoyé à {member.email}. Les réponses arrivent sur contact@. Mise en forme : **gras**, listes avec « - », liens [texte](adresse).</p>
            <ActionForm action={sendMemberMessage}>
              {hidden}
              <Field label="Objet" htmlFor="subject">
                <Input id="subject" name="subject" required minLength={3} maxLength={150} />
              </Field>
              <Field label="Message" htmlFor="body" hint="« Bonjour [prénom], » et la signature sont ajoutés automatiquement.">
                <Textarea id="body" name="body" rows={7} required minLength={10} maxLength={10000} />
              </Field>
              <SubmitButton pendingLabel="Envoi…">Envoyer</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {/* Notes et étiquettes */}
          <Card>
            <h2 className="mb-1 text-xl font-semibold">Notes internes</h2>
            <p className="mb-4 text-sm text-muted">Visibles des seuls admins, jamais du membre.</p>
            <ActionForm action={saveAdminNote} resetOnSuccess={false}>
              {hidden}
              <Field label="Étiquettes" htmlFor="tags" hint="Séparées par des virgules : cuma, eta, partenaire…">
                <Input id="tags" name="tags" defaultValue={(file?.tags ?? []).join(', ')} list="tags-connues" autoComplete="off" />
              </Field>
              <datalist id="tags-connues">
                {allTags.map((t) => <option key={t} value={t} />)}
              </datalist>
              <Field label="Note" htmlFor="note">
                <Textarea id="note" name="note" rows={6} maxLength={5000} defaultValue={file?.note ?? ''} placeholder="Contexte, échanges, demandes particulières…" />
              </Field>
              {file?.updated_at ? <p className="text-xs text-muted">Modifié le {dateTime(file.updated_at)}</p> : null}
              <SubmitButton variant="secondary" pendingLabel="…">Enregistrer</SubmitButton>
            </ActionForm>
          </Card>

          {/* Informations */}
          <Card>
            <h2 className="mb-4 text-xl font-semibold">Informations</h2>
            <ActionForm action={updateMemberInfo} resetOnSuccess={false}>
              {hidden}
              <Field label="Nom et prénom" htmlFor="full_name">
                <Input id="full_name" name="full_name" defaultValue={member.full_name} maxLength={120} />
              </Field>
              <Field label="Exploitation" htmlFor="farm_name">
                <Input id="farm_name" name="farm_name" defaultValue={member.farm_name} maxLength={120} />
              </Field>
              <Field label="Adresse e-mail (connexion)" htmlFor="email" hint="La changer change aussi l’adresse de connexion, sans confirmation par e-mail.">
                <Input id="email" name="email" type="email" defaultValue={member.email} required />
              </Field>
              <SubmitButton variant="secondary" pendingLabel="…">Enregistrer</SubmitButton>
            </ActionForm>
          </Card>

          {/* Compte et sécurité */}
          <Card className="flex flex-col gap-2">
            <h2 className="mb-2 text-xl font-semibold">Compte et sécurité</h2>
            {self ? (
              <p className="text-sm text-muted">C’est votre compte : rôle, suspension et suppression ne se gèrent pas d’ici.</p>
            ) : null}
            <ActionForm action={sendResetLink} className="flex flex-col gap-2">
              {hidden}
              <SubmitButton variant="secondary">Envoyer un lien de mot de passe</SubmitButton>
            </ActionForm>
            <a href={`/api/admin/membres/${member.id}/export`} className={btn.secondary} download>
              Exporter ses données (RGPD)
            </a>
            {!self ? (
              <>
                <ActionForm action={setRole} className="flex flex-col gap-2">
                  {hidden}
                  <input type="hidden" name="role" value={member.role === 'admin' ? 'member' : 'admin'} />
                  <SubmitButton variant="secondary">{member.role === 'admin' ? 'Retirer les droits admin' : 'Donner les droits admin'}</SubmitButton>
                </ActionForm>
                <ActionForm action={toggleSuspension} className="flex flex-col gap-2">
                  {hidden}
                  <SubmitButton variant="danger">{member.suspended ? 'Réactiver le compte' : 'Suspendre le compte'}</SubmitButton>
                </ActionForm>
                <details className="rounded-xl border border-danger/40 p-3.5">
                  <summary className="cursor-pointer font-semibold text-danger">Supprimer le compte</summary>
                  <ActionForm action={deleteMember} className="mt-3 flex flex-col gap-2">
                    {hidden}
                    <Field label={`Recopiez ${member.email} pour confirmer`} htmlFor="confirm">
                      <Input id="confirm" name="confirm" autoComplete="off" required />
                    </Field>
                    <p className="text-sm text-muted">L’abonnement Stripe éventuel est résilié, puis le compte et toutes ses données sont effacés.</p>
                    <SubmitButton variant="danger" pendingLabel="Suppression…">Supprimer définitivement</SubmitButton>
                  </ActionForm>
                </details>
              </>
            ) : null}
            <p className="text-[13px] text-muted">Toutes ces actions sont enregistrées dans le journal.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
