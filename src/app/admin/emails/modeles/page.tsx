import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { EmailPreview } from '@/components/email-preview';
import { env } from '@/lib/env';
import {
  AUTH_TEMPLATES,
  AUTH_TEMPLATE_LABELS,
  BILLING_TEMPLATES,
  BILLING_TEMPLATE_LABELS,
  authEmail,
  billingEmail,
  campaignEmail,
  reminderEmail,
  type AuthTemplate,
  type BillingTemplate,
  type BuiltEmail,
} from '@/lib/email/templates';

export const metadata: Metadata = { title: 'Modèles d’e-mails' };

type Key = AuthTemplate | BillingTemplate | 'rappel' | 'annonce';

const SAMPLE_MD = `La saison des moissons approche : c’est le bon moment pour faire le point sur vos machines.

## Nouveau : le rapport pour la revente

- l’historique complet des entretiens ;
- les relevés de compteur ;
- les dépenses, si vous le souhaitez.

Retrouvez-le sur la fiche de chaque machine, dans [votre parc matériel](/app/materiel).`;

function sample(key: Key, site: string, name: string): BuiltEmail {
  const url = `${site}/auth/confirm?token_hash=exemple&type=signup&suite=/app`;
  if (key === 'rappel') {
    return reminderEmail(
      {
        name,
        preferencesUrl: `${site}/preferences-e-mail`,
        rows: [
          { machine: 'Fendt 724 Vario', operation: 'Vidange moteur + filtre', when: 'en retard de 12 h', level: 'retard' },
          { machine: 'Claas Lexion 760', operation: 'Graissage général', when: 'dans 18 jours', level: 'bientot' },
          { machine: 'Manitou MLT 737', operation: 'Filtre à air', when: 'dans 20 h ou 3 mois', level: 'bientot' },
        ],
      },
      site,
    );
  }
  if ((BILLING_TEMPLATES as readonly string[]).includes(key)) {
    return billingEmail(
      key as BillingTemplate,
      { name, trial: true, priceLabel: '6,99 € par mois', date: '24 novembre 2026', amount: '6,99 €', invoiceUrl: `${site}/app/abonnement` },
      site,
    );
  }
  if (key === 'annonce') return campaignEmail({ subject: 'Préparez la moisson avec Tracteurs & Co', bodyMd: SAMPLE_MD, name, preferencesUrl: `${site}/preferences-e-mail` }, site);
  return authEmail(key as AuthTemplate, { name, url, code: '482915', newEmail: 'nouvelle.adresse@exemple.fr' }, site);
}

const GROUPS: { title: string; keys: Key[] }[] = [
  { title: 'Compte', keys: ['signup', 'recovery', 'magiclink', 'invite', 'email_change_current', 'email_change_new', 'reauthentication'] },
  { title: 'Alertes de sécurité', keys: AUTH_TEMPLATES.filter((t) => t.endsWith('_notification')) },
  { title: 'Abonnement', keys: [...BILLING_TEMPLATES] },
  { title: 'Parc matériel', keys: ['rappel', 'annonce'] },
];
const LABELS: Record<Key, string> = { ...AUTH_TEMPLATE_LABELS, ...BILLING_TEMPLATE_LABELS, rappel: 'Rappel d’entretien', annonce: 'Annonce (exemple)' };

export default async function EmailTemplatesPage(props: PageProps<'/admin/emails/modeles'>) {
  const { profile } = await requireAdmin('/admin/emails/modeles');
  const { m } = await props.searchParams;
  const current: Key = typeof m === 'string' && m in LABELS ? (m as Key) : 'signup';
  const site = env.siteUrl().replace(/\/$/, '');
  const email = sample(current, site, profile.full_name || 'Théo');

  return (
    <>
      <div>
        <Link href="/admin/emails" className="text-sm text-brand">← E-mails</Link>
        <h1 className="text-[28px] font-bold tracking-tight">Modèles d’e-mails</h1>
        <p className="text-muted">Aperçu de chaque e-mail avec des données d’exemple. Les textes se modifient dans le code (src/lib/email/templates.ts).</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="Modèles" className="flex flex-col gap-4">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{g.title}</p>
              <div className="flex flex-col gap-0.5">
                {g.keys.map((k) => (
                  <Link
                    key={k}
                    href={`/admin/emails/modeles?m=${k}`}
                    aria-current={k === current ? 'page' : undefined}
                    className={`rounded-lg px-3 py-2 text-sm transition-colors ${k === current ? 'bg-brand font-semibold text-on-brand' : 'hover:bg-surface-2'}`}
                  >
                    {LABELS[k]}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="min-w-0">
          <div className="mb-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
            <span className="text-muted">Objet : </span>
            <strong>{email.subject}</strong>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line">
            <EmailPreview key={current} html={email.html} />
          </div>
          <details className="mt-3 rounded-xl border border-line bg-surface p-4 text-sm">
            <summary className="cursor-pointer font-semibold">Version texte (pour les messageries sans HTML)</summary>
            <pre className="mt-3 whitespace-pre-wrap font-mono text-[13px] text-muted">{email.text}</pre>
          </details>
        </div>
      </div>
    </>
  );
}
