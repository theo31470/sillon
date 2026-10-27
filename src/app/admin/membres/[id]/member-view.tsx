import Link from 'next/link';
import { formatDate, formatEuros } from '@/lib/format';
import { DIAGNOSTIC_MONTHLY_LIMIT, PLANS } from '@/lib/plans';
import type { MemberAdmin, Payment, Profile, Subscription } from '@/lib/types';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Field, Input, Notice, Select, Textarea, btn } from '@/components/ui';
import { Facts, FormActions, Panel, SettingRow, StatTile, Tabs } from '../layout-bits';
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

export const TABS = { abonnement: 'Abonnement', profil: 'Profil et notes', activite: 'Activité', message: 'Écrire', securite: 'Compte et sécurité' } as const;
export type Tab = keyof typeof TABS;

export type MemberData = {
  member: Profile;
  subs: Subscription[];
  payments: Payment[];
  file: MemberAdmin | null;
  emails: { id: number | string; kind: string; subject: string; status: string; created_at: string }[];
  audit: { id: number | string; actor_email: string | null; action: string; created_at: string }[];
  machines: number;
  logs: number;
  ai: { diagnostics: number; costUsd: number };
  auth: { lastSignInAt: string | null; emailConfirmedAt: string | null; mfa: boolean };
  allTags: string[];
  quota: { usedMonth: number; limit: number };
  self: boolean;
  recentMfa: boolean;
};

const SUB_LABELS: Record<string, string> = {
  trialing: 'Essai gratuit',
  active: 'Actif',
  past_due: 'Paiement en retard',
  unpaid: 'Impayé',
  canceled: 'Résilié',
  incomplete: 'Incomplet',
  incomplete_expired: 'Expiré',
};
const EMAIL_KINDS: Record<string, string> = { compte: 'Compte', rappel: 'Rappel', annonce: 'Annonce', test: 'Test', facturation: 'Abonnement', message: 'Message', contact: 'Contact' };
const RUNNING = ['trialing', 'active', 'past_due', 'unpaid'];

const dateTime = (iso: string | null | undefined) => (iso ? formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const longDate = (iso: string) => formatDate(iso, { day: 'numeric', month: 'long', year: 'numeric' });
const actionLabel = (a: string) => a.replace(/^membres?\./, '').replace(/_/g, ' ');

function ago(iso: string | null) {
  if (!iso) return 'jamais';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 60) return 'à l’instant';
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d < 60 ? `il y a ${d} j` : formatDate(iso);
}

const initials = (s: string) =>
  s
    .split(/[\s@.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

export function MemberView({ data, tab }: { data: MemberData; tab: Tab }) {
  const { member, subs, payments, file, quota, self, recentMfa } = data;
  const sub = subs.find((s) => RUNNING.includes(s.status)) ?? subs[0] ?? null;
  const subRunning = Boolean(sub && RUNNING.includes(sub.status));
  const compRunning = member.comp_active && (!member.comp_until || new Date(member.comp_until) > new Date());
  const refundable = payments.find((x) => x.status === 'paid' && x.amount_cents > 0);
  const base = `/admin/membres/${member.id}`;
  const hidden = <input type="hidden" name="user_id" value={member.id} />;
  const title = member.farm_name || member.full_name || member.email;
  const mfaLink = `/securite/2fa?forcer=1&suite=${encodeURIComponent(`${base}?onglet=${tab}`)}`;

  // Échéance affichée dans le bandeau
  const nextDate = sub && subRunning && sub.current_period_end ? longDate(sub.current_period_end) : compRunning ? (member.comp_until ? longDate(member.comp_until) : 'sans fin') : '—';
  const nextLabel = sub && subRunning ? (sub.cancel_at_period_end ? 'Fin d’abonnement' : sub.status === 'trialing' ? 'Fin de l’essai' : 'Prochain paiement') : compRunning ? 'Fin de l’offre' : 'Échéance';
  const formula = PLANS[member.plan].name + (compRunning && !subRunning ? ' (offerte)' : '');

  return (
    <>
      {/* En-tête */}
      <div className="flex flex-col gap-4">
        <Link href="/admin/membres" className="text-sm text-brand">← Tous les membres</Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-brand text-lg font-bold text-on-brand">
              {initials(title) || '?'}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-[26px] font-bold tracking-tight">{title}</h1>
                {member.suspended ? <Badge tone="red">Suspendu</Badge> : null}
                {member.role === 'admin' ? <Badge tone="amber">Admin</Badge> : null}
                {(file?.tags ?? []).map((t) => (
                  <Link key={t} href={`/admin/membres?etiquette=${encodeURIComponent(t)}`} className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-muted hover:border-brand">
                    #{t}
                  </Link>
                ))}
              </div>
              <p className="truncate text-muted">
                {member.full_name ? `${member.full_name} · ` : ''}
                {member.email}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href={`${base}?onglet=message`} scroll={false} className={btn.small}>Écrire</Link>
            {member.stripe_customer_id ? (
              <a href={`https://dashboard.stripe.com/customers/${member.stripe_customer_id}`} target="_blank" rel="noopener noreferrer" className={btn.small}>
                Stripe ↗
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {/* Bandeau de synthèse */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="Formule"
          value={formula}
          sub={sub && subRunning ? (sub.cancel_at_period_end ? 'Résiliation programmée' : SUB_LABELS[sub.status]) : compRunning ? 'Hors Stripe' : 'Sans abonnement'}
          tone={sub?.status === 'past_due' || sub?.status === 'unpaid' ? 'warn' : undefined}
        />
        <StatTile label={nextLabel} value={nextDate} />
        <StatTile label="Parc" value={`${data.machines} machine${data.machines > 1 ? 's' : ''}`} sub={`${data.logs} entretien${data.logs > 1 ? 's' : ''} noté${data.logs > 1 ? 's' : ''}`} />
        <StatTile label="Dernière activité" value={ago(member.last_seen_at)} sub={`Inscrit le ${formatDate(member.created_at)}`} />
        <StatTile label="Diagnostics ce mois" value={`${quota.usedMonth} / ${quota.limit}`} sub={file?.diag_monthly_limit != null ? 'Quota personnalisé' : 'Quota normal'} />
      </div>

      <Tabs current={tab} tabs={(Object.keys(TABS) as Tab[]).map((k) => ({ key: k, label: TABS[k], href: `${base}?onglet=${k}` }))} />

      {!recentMfa && tab !== 'activite' && tab !== 'message' ? (
        <Notice>
          Les actions sensibles (remboursement, résiliation immédiate, changement d’e-mail, suspension, suppression) demandent un code récent :{' '}
          <Link href={mfaLink} className="font-semibold underline">validez à nouveau votre code</Link> (valable 15 min).
        </Notice>
      ) : null}

      {tab === 'abonnement' ? (
        <Panel>
          <SettingRow title="Situation" description="Abonnement Stripe et formule offerte.">
            <Facts
              rows={[
                ['Formule', formula],
                ['Abonnement Stripe', sub ? `${SUB_LABELS[sub.status] ?? sub.status}${sub.cancel_at_period_end && subRunning ? ' · résiliation programmée' : ''}` : 'aucun'],
                ...(sub?.current_period_end && subRunning ? ([[nextLabel, longDate(sub.current_period_end)]] as [string, string][]) : []),
                ['Formule offerte', compRunning ? (member.comp_until ? `jusqu’au ${longDate(member.comp_until)}` : 'sans date de fin') : 'non'],
              ]}
            />
          </SettingRow>

          {subRunning ? (
            <SettingRow title="Offrir des jours" description="Repousse le prochain paiement : prolonge l’essai, ou en ajoute un à un abonné qui paie déjà.">
              <ActionForm action={extendTrial} className="flex flex-col gap-3">
                {hidden}
                <FormActions>
                  <Select name="jours" defaultValue="30" aria-label="Nombre de jours" className="max-w-44">
                    {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} jours</option>)}
                  </Select>
                  <SubmitButton variant="secondary" pendingLabel="…">Offrir</SubmitButton>
                </FormActions>
              </ActionForm>
            </SettingRow>
          ) : null}

          {subRunning ? (
            <SettingRow title="Résiliation" description="En fin de période, l’accès reste ouvert jusqu’à l’échéance. « Maintenant » coupe l’accès tout de suite, sans remboursement automatique.">
              <ActionForm action={manageSubscription} resetOnSuccess={false} className="flex flex-col gap-3">
                {hidden}
                <FormActions>
                  {sub?.cancel_at_period_end ? (
                    <SubmitButton variant="secondary" name="mode" value="reprendre" pendingLabel="…">Annuler la résiliation</SubmitButton>
                  ) : (
                    <SubmitButton variant="secondary" name="mode" value="fin" pendingLabel="…">Résilier en fin de période</SubmitButton>
                  )}
                  <SubmitButton variant="danger" name="mode" value="immediat" pendingLabel="…">Résilier maintenant</SubmitButton>
                </FormActions>
              </ActionForm>
            </SettingRow>
          ) : null}

          <SettingRow
            title="Formule offerte"
            description="La formule Complet sans carte ni Stripe : partenaire, testeur, geste commercial. Elle s’arrête toute seule à l’échéance."
          >
            <div className="flex flex-col gap-3">
              <ActionForm action={grantComp} className="flex flex-col gap-3">
                {hidden}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Durée" htmlFor="duree">
                    <Select id="duree" name="duree" defaultValue="3">
                      <option value="1">1 mois</option>
                      <option value="3">3 mois</option>
                      <option value="6">6 mois</option>
                      <option value="12">1 an</option>
                      <option value="date">Jusqu’à une date</option>
                      <option value="illimite">Sans date de fin</option>
                    </Select>
                  </Field>
                  <Field label="Date de fin" htmlFor="date" hint="Seulement pour « jusqu’à une date ».">
                    <Input id="date" type="date" name="date" />
                  </Field>
                </div>
                <FormActions>
                  <SubmitButton variant="secondary" pendingLabel="…">{compRunning ? 'Prolonger' : 'Offrir la formule'}</SubmitButton>
                </FormActions>
              </ActionForm>
              {compRunning ? (
                <ActionForm action={revokeComp} className="flex flex-col gap-2">
                  {hidden}
                  <FormActions>
                    <SubmitButton variant="danger" pendingLabel="…">Retirer la formule offerte</SubmitButton>
                  </FormActions>
                </ActionForm>
              ) : null}
            </div>
          </SettingRow>

          <SettingRow title="Quota de diagnostics" description={`Nombre d’aides au diagnostic par mois. Vide : quota normal (${DIAGNOSTIC_MONTHLY_LIMIT}). 0 : désactivé pour ce membre.`}>
            <ActionForm action={setDiagnosticQuota} resetOnSuccess={false} className="flex flex-col gap-3">
              {hidden}
              <FormActions>
                <span className="mr-auto text-sm text-muted">Utilisés ce mois-ci : {quota.usedMonth} / {quota.limit}</span>
                <Input name="limit" type="number" min={0} max={1000} defaultValue={file?.diag_monthly_limit ?? ''} placeholder={String(DIAGNOSTIC_MONTHLY_LIMIT)} aria-label="Diagnostics par mois" className="max-w-32" />
                <SubmitButton variant="secondary" pendingLabel="…">Enregistrer</SubmitButton>
              </FormActions>
            </ActionForm>
          </SettingRow>

          <SettingRow title="Paiements" description="Les 6 derniers. Le remboursement porte sur le dernier paiement, en totalité.">
            <div className="flex flex-col gap-4">
              {payments.length ? (
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {payments.map((x) => (
                      <tr key={x.id} className="border-b border-line-soft last:border-0">
                        <td className="py-2.5 pr-3">{longDate(x.created_at)}</td>
                        <td className="py-2.5 pr-3 tabular-nums">{formatEuros(x.amount_cents, x.currency)}</td>
                        <td className="py-2.5 pr-3">{x.status === 'paid' ? <Badge tone="green">Payé</Badge> : x.status === 'refunded' ? <Badge>Remboursé</Badge> : <Badge tone="red">Échec</Badge>}</td>
                        <td className="py-2.5 text-right">{x.hosted_invoice_url ? <a href={x.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand">Facture</a> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted">Aucun paiement.</p>
              )}
              {refundable ? (
                <ActionForm action={refundLastPayment} className="flex flex-col gap-2">
                  {hidden}
                  <FormActions>
                    <span className="mr-auto text-sm text-muted">Dernier paiement : {formatEuros(refundable.amount_cents, refundable.currency)} du {longDate(refundable.created_at)}</span>
                    <SubmitButton variant="danger" pendingLabel="Remboursement…">Rembourser</SubmitButton>
                  </FormActions>
                </ActionForm>
              ) : null}
            </div>
          </SettingRow>
        </Panel>
      ) : null}

      {tab === 'profil' ? (
        <Panel>
          <SettingRow title="Informations" description="Changer l’adresse e-mail change aussi l’adresse de connexion (sans confirmation par e-mail) et celle de Stripe.">
            <ActionForm action={updateMemberInfo} resetOnSuccess={false}>
              {hidden}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nom et prénom" htmlFor="full_name">
                  <Input id="full_name" name="full_name" defaultValue={member.full_name} maxLength={120} />
                </Field>
                <Field label="Exploitation" htmlFor="farm_name">
                  <Input id="farm_name" name="farm_name" defaultValue={member.farm_name} maxLength={120} />
                </Field>
              </div>
              <Field label="Adresse e-mail" htmlFor="email">
                <Input id="email" name="email" type="email" defaultValue={member.email} required />
              </Field>
              <FormActions>
                <SubmitButton variant="secondary" pendingLabel="…">Enregistrer</SubmitButton>
              </FormActions>
            </ActionForm>
          </SettingRow>
          <SettingRow title="Étiquettes et note interne" description="Visibles des seuls admins, jamais du membre. Les étiquettes servent de filtre dans la liste.">
            <ActionForm action={saveAdminNote} resetOnSuccess={false}>
              {hidden}
              <Field label="Étiquettes" htmlFor="tags" hint="Séparées par des virgules : cuma, eta, partenaire…">
                <Input id="tags" name="tags" defaultValue={(file?.tags ?? []).join(', ')} list="tags-connues" autoComplete="off" />
              </Field>
              <datalist id="tags-connues">
                {data.allTags.map((t) => <option key={t} value={t} />)}
              </datalist>
              <Field label="Note" htmlFor="note">
                <Textarea id="note" name="note" rows={6} maxLength={5000} defaultValue={file?.note ?? ''} placeholder="Contexte, échanges, demandes particulières…" />
              </Field>
              <FormActions>
                {file?.updated_at ? <span className="mr-auto text-xs text-muted">Modifié le {dateTime(file.updated_at)}</span> : null}
                <SubmitButton variant="secondary" pendingLabel="…">Enregistrer</SubmitButton>
              </FormActions>
            </ActionForm>
          </SettingRow>
          <SettingRow title="Préférences e-mail" description="Réglées par le membre lui-même.">
            <Facts
              rows={[
                ['Rappels d’entretien', member.email_reminders ? 'oui' : 'non'],
                ['Annonces', member.email_news ? 'oui' : 'non'],
              ]}
            />
          </SettingRow>
        </Panel>
      ) : null}

      {tab === 'activite' ? (
        <Panel>
          <SettingRow title="Connexion">
            <Facts
              rows={[
                ['Dernière activité', dateTime(member.last_seen_at)],
                ['Dernière connexion', dateTime(data.auth.lastSignInAt)],
                ['Inscription', dateTime(member.created_at)],
                ['E-mail confirmé', data.auth.emailConfirmedAt ? `oui, le ${longDate(data.auth.emailConfirmedAt)}` : 'non'],
                ['Double authentification', data.auth.mfa ? 'activée' : 'non activée'],
              ]}
            />
          </SettingRow>
          <SettingRow title="Utilisation">
            <Facts
              rows={[
                ['Parc', `${data.machines} machine${data.machines > 1 ? 's' : ''} · ${data.logs} entretien${data.logs > 1 ? 's' : ''} noté${data.logs > 1 ? 's' : ''}`],
                ['Diagnostics ce mois', `${quota.usedMonth} / ${quota.limit}`],
                ['Coût de l’IA ce mois', data.ai.costUsd.toLocaleString('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 3 })],
              ]}
            />
          </SettingRow>
          <SettingRow title="E-mails reçus" description="Les 8 derniers envoyés par le site.">
            {data.emails.length ? (
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {data.emails.map((e) => (
                    <tr key={e.id} className="border-b border-line-soft last:border-0">
                      <td className="w-28 py-2.5 pr-3 text-muted">{EMAIL_KINDS[e.kind] ?? e.kind}</td>
                      <td className="max-w-0 truncate py-2.5 pr-3" title={e.subject}>{e.subject}</td>
                      <td className="whitespace-nowrap py-2.5 text-right text-muted">
                        {e.status === 'sent' ? null : <Badge tone="red">Échec</Badge>} {dateTime(e.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted">Aucun e-mail envoyé.</p>
            )}
          </SettingRow>
          <SettingRow title="Actions des admins" description="Les 10 dernières sur ce compte (journal complet dans « Journal d’activité »).">
            {data.audit.length ? (
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {data.audit.map((a) => (
                    <tr key={a.id} className="border-b border-line-soft last:border-0">
                      <td className="py-2.5 pr-3 first-letter:uppercase">{actionLabel(a.action)}</td>
                      <td className="py-2.5 pr-3 text-muted">{a.actor_email ?? 'système'}</td>
                      <td className="whitespace-nowrap py-2.5 text-right text-muted">{dateTime(a.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted">Aucune action enregistrée.</p>
            )}
          </SettingRow>
        </Panel>
      ) : null}

      {tab === 'message' ? (
        <Panel>
          <SettingRow
            title="Lui écrire"
            description={
              <>
                E-mail aux couleurs du site, envoyé à {member.email}. « Bonjour [prénom], » et la signature sont ajoutés automatiquement. Les réponses arrivent sur contact@.
              </>
            }
          >
            <ActionForm action={sendMemberMessage}>
              {hidden}
              <Field label="Objet" htmlFor="subject">
                <Input id="subject" name="subject" required minLength={3} maxLength={150} />
              </Field>
              <Field label="Message" htmlFor="body" hint="Mise en forme : **gras**, listes avec « - », liens [texte](adresse).">
                <Textarea id="body" name="body" rows={9} required minLength={10} maxLength={10000} />
              </Field>
              <FormActions>
                <SubmitButton pendingLabel="Envoi…">Envoyer</SubmitButton>
              </FormActions>
            </ActionForm>
          </SettingRow>
        </Panel>
      ) : null}

      {tab === 'securite' ? (
        <Panel>
          <SettingRow title="Mot de passe" description="Le membre reçoit un lien pour choisir un nouveau mot de passe.">
            <ActionForm action={sendResetLink} className="flex flex-col gap-2">
              {hidden}
              <FormActions>
                <SubmitButton variant="secondary">Envoyer le lien</SubmitButton>
              </FormActions>
            </ActionForm>
          </SettingRow>
          <SettingRow title="Données personnelles" description="Toutes ses données dans un fichier (droit d’accès RGPD).">
            <FormActions>
              <a href={`/api/admin/membres/${member.id}/export`} className={btn.secondary} download>Exporter</a>
            </FormActions>
          </SettingRow>
          {self ? (
            <SettingRow title="Votre compte" description="Rôle, suspension et suppression ne se gèrent pas depuis votre propre fiche.">
              <span />
            </SettingRow>
          ) : (
            <>
              <SettingRow title="Droits d’administration" description={member.role === 'admin' ? 'Ce membre est administrateur.' : 'Donne accès à toute l’administration (double authentification obligatoire).'}>
                <ActionForm action={setRole} className="flex flex-col gap-2">
                  {hidden}
                  <input type="hidden" name="role" value={member.role === 'admin' ? 'member' : 'admin'} />
                  <FormActions>
                    <SubmitButton variant="secondary">{member.role === 'admin' ? 'Retirer les droits admin' : 'Donner les droits admin'}</SubmitButton>
                  </FormActions>
                </ActionForm>
              </SettingRow>
              <SettingRow title={member.suspended ? 'Compte suspendu' : 'Suspendre le compte'} description="Un compte suspendu ne peut plus se connecter. Rien n’est effacé et l’abonnement n’est pas résilié." danger>
                <ActionForm action={toggleSuspension} className="flex flex-col gap-2">
                  {hidden}
                  <FormActions>
                    <SubmitButton variant={member.suspended ? 'secondary' : 'danger'}>{member.suspended ? 'Réactiver le compte' : 'Suspendre'}</SubmitButton>
                  </FormActions>
                </ActionForm>
              </SettingRow>
              <SettingRow title="Supprimer le compte" description="Résilie l’abonnement Stripe éventuel, puis efface le compte et toutes ses données. Irréversible." danger>
                <ActionForm action={deleteMember} className="flex flex-col gap-3">
                  {hidden}
                  <Field label={`Recopiez ${member.email} pour confirmer`} htmlFor="confirm">
                    <Input id="confirm" name="confirm" autoComplete="off" required />
                  </Field>
                  <FormActions>
                    <SubmitButton variant="danger" pendingLabel="Suppression…">Supprimer définitivement</SubmitButton>
                  </FormActions>
                </ActionForm>
              </SettingRow>
            </>
          )}
        </Panel>
      ) : null}
    </>
  );
}
