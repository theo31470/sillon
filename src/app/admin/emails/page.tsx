import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { daysAgoIso, formatDate } from '@/lib/format';
import { emailSettings } from '@/lib/email/send';
import { AUDIENCES, audienceCounts, type Audience } from '@/lib/email/campaigns';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Card, btn } from '@/components/ui';
import { Compose } from './compose';
import { runRemindersNow } from './actions';

export const metadata: Metadata = { title: 'E-mails' };
export const dynamic = 'force-dynamic';

const KIND_LABELS: Record<string, string> = { compte: 'Compte', rappel: 'Rappel', annonce: 'Annonce', test: 'Test', facturation: 'Abonnement', message: 'Message', contact: 'Contact' };
const dateTime = (iso: string) => formatDate(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default async function AdminEmailsPage() {
  const { profile } = await requireAdmin('/admin/emails');
  const supabase = await createClient();
  const settings = emailSettings();
  const since30 = daysAgoIso(30);

  const [counts, log, campaigns, runs, sent30, failed30] = await Promise.all([
    audienceCounts(),
    supabase.from('email_log').select('id, to_email, kind, template, subject, status, error, created_at').order('created_at', { ascending: false }).limit(40),
    supabase.from('email_campaigns').select('*').order('created_at', { ascending: false }).limit(20),
    supabase.from('reminder_runs').select('*').order('day', { ascending: false }).limit(7),
    supabase.from('email_log').select('kind').eq('status', 'sent').gte('created_at', since30),
    supabase.from('email_log').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', since30),
  ]);

  const byKind = { compte: 0, rappel: 0, annonce: 0 } as Record<string, number>;
  for (const r of sent30.data ?? []) if (r.kind in byKind) byKind[r.kind]++;

  const checks = [
    { ok: settings.apiKeySet, label: 'Clé Resend (RESEND_API_KEY)', help: 'À ajouter dans Vercel, en « Sensitive ».' },
    {
      ok: !settings.testSender,
      label: `Adresse d’envoi : ${settings.from}`,
      help: settings.testSender ? 'Adresse d’essai : n’écrit qu’au propriétaire du compte Resend. Renseignez EMAIL_FROM une fois le domaine vérifié.' : 'Domaine vérifié dans Resend.',
    },
    { ok: settings.hookSecretSet, label: 'Secret du hook Supabase (SEND_EMAIL_HOOK_SECRET)', help: 'Copié depuis Supabase → Authentication → Hooks, collé dans Vercel en « Sensitive ».' },
  ];
  const ready = checks.every((c) => c.ok);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">E-mails</h1>
          <p className="text-muted">E-mails de compte, rappels d’entretien et annonces aux membres, aux couleurs de Tracteurs &amp; Co.</p>
        </div>
        <Link href="/admin/emails/modeles" className={btn.secondary}>Voir les modèles</Link>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 md:[grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        {[
          ['E-mails de compte', byKind.compte],
          ['Rappels d’entretien', byKind.rappel],
          ['Annonces', byKind.annonce],
          ['Échecs', failed30.count ?? 0],
        ].map(([label, n], i) => (
          <div key={label} className={`rounded-2xl border p-5 ${i === 3 && Number(n) > 0 ? 'border-warn-line bg-warn-soft' : 'border-line bg-surface'}`}>
            <p className="mb-1.5 text-sm text-muted">{label}</p>
            <p className={`text-[28px] font-bold ${i === 3 && Number(n) > 0 ? 'text-warn' : ''}`}>{n}</p>
            <p className="mt-1 text-[13px] text-muted">sur 30 jours</p>
          </div>
        ))}
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Configuration</h2>
          {ready ? <Badge tone="green">Prêt</Badge> : <Badge tone="amber">À terminer</Badge>}
        </div>
        <ul className="flex flex-col gap-2.5">
          {checks.map((c) => (
            <li key={c.label} className="flex gap-3">
              <span aria-hidden="true" className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold ${c.ok ? 'bg-success-soft text-success' : 'bg-warn-soft text-warn'}`}>
                {c.ok ? '✓' : '!'}
              </span>
              <span>
                <span className="block font-semibold">{c.label}</span>
                <span className="block text-sm text-muted">{c.help}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">
          Les e-mails de compte ne passent par ce système qu’une fois le hook « Send Email » activé dans Supabase, avec l’adresse{' '}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[13px]">{env.siteUrl().replace(/\/$/, '')}/api/auth/email-hook</code>. Sinon, Supabase envoie ses propres e-mails.
        </p>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Rappels d’entretien</h2>
            <p className="text-sm text-muted">Tournée chaque matin vers 7 h. Un membre n’est prévenu que lorsqu’une échéance passe « bientôt » ou « en retard », une seule fois par niveau.</p>
          </div>
          <ActionForm action={runRemindersNow} resetOnSuccess={false} className="flex flex-col items-end gap-2">
            <SubmitButton variant="secondary" pendingLabel="Tournée en cours…">Lancer la tournée maintenant</SubmitButton>
          </ActionForm>
        </div>
        {(runs.data ?? []).length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-muted">
                  {['Jour', 'Membres vérifiés', 'Rappels envoyés', 'Statut'].map((h) => <th key={h} className="border-b border-line py-2 pr-3 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(runs.data ?? []).map((r) => (
                  <tr key={r.day}>
                    <td className="border-b border-line-soft py-2 pr-3">{formatDate(r.day)}</td>
                    <td className="border-b border-line-soft py-2 pr-3 tabular-nums">{r.users_checked}</td>
                    <td className="border-b border-line-soft py-2 pr-3 tabular-nums">{r.emails_sent}</td>
                    <td className="border-b border-line-soft py-2">{r.finished_at ? <Badge tone="green">Terminée</Badge> : <Badge tone="amber">En cours</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Aucune tournée pour l’instant.</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-xl font-semibold">Nouvelle annonce</h2>
        <p className="mb-5 text-sm text-muted">Nouvelles fonctions, conseils de saison… Chaque e-mail contient un lien pour se désinscrire.</p>
        <Compose siteUrl={env.siteUrl().replace(/\/$/, '')} counts={counts} previewName={profile.full_name} />
      </Card>

      <section className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <h2 className="px-4 pt-4 text-xl font-semibold">Annonces envoyées</h2>
        {(campaigns.data ?? []).length ? (
          <table className="mt-3 w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-surface-2 text-left text-[13px] text-muted">
                {['Date', 'Objet', 'Public', 'Envoyés', 'Statut'].map((h) => <th key={h} className="border-b border-line px-4 py-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {(campaigns.data ?? []).map((c) => (
                <tr key={c.id}>
                  <td className="border-b border-line-soft px-4 py-3 whitespace-nowrap">{dateTime(c.created_at)}</td>
                  <td className="border-b border-line-soft px-4 py-3 font-semibold">{c.subject}</td>
                  <td className="border-b border-line-soft px-4 py-3">{AUDIENCES[c.audience as Audience]}</td>
                  <td className="border-b border-line-soft px-4 py-3 tabular-nums">
                    {c.sent} / {c.recipients}
                    {c.failed ? <span className="text-danger"> · {c.failed} échec{c.failed > 1 ? 's' : ''}</span> : null}
                  </td>
                  <td className="border-b border-line-soft px-4 py-3">
                    {c.status === 'sent' ? <Badge tone="green">Envoyée</Badge> : c.status === 'sending' ? <Badge tone="blue">En cours</Badge> : <Badge tone="red">Échec</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 pb-4 pt-2 text-sm text-muted">Aucune annonce envoyée.</p>
        )}
      </section>

      <section className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <h2 className="px-4 pt-4 text-xl font-semibold">Derniers envois</h2>
        {(log.data ?? []).length ? (
          <table className="mt-3 w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-surface-2 text-left text-[13px] text-muted">
                {['Date', 'Destinataire', 'Type', 'Objet', 'Statut'].map((h) => <th key={h} className="border-b border-line px-4 py-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {(log.data ?? []).map((l) => (
                <tr key={l.id}>
                  <td className="border-b border-line-soft px-4 py-3 whitespace-nowrap">{dateTime(l.created_at)}</td>
                  <td className="border-b border-line-soft px-4 py-3">{l.to_email}</td>
                  <td className="border-b border-line-soft px-4 py-3">{KIND_LABELS[l.kind] ?? l.kind}</td>
                  <td className="max-w-[320px] truncate border-b border-line-soft px-4 py-3" title={l.subject}>{l.subject}</td>
                  <td className="border-b border-line-soft px-4 py-3">
                    {l.status === 'sent' ? <Badge tone="green">Envoyé</Badge> : <span title={l.error ?? ''}><Badge tone="red">Échec</Badge></span>}
                    {l.status === 'failed' && l.error ? <p className="mt-1 max-w-[260px] text-xs text-danger">{l.error}</p> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 pb-4 pt-2 text-sm text-muted">Aucun e-mail envoyé pour l’instant.</p>
        )}
      </section>
    </>
  );
}
