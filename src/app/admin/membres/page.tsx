import Link from 'next/link';
import { hasRecentMfa, requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { formatDate, formatEuros, maskEmail } from '@/lib/format';
import { PLANS } from '@/lib/plans';
import type { Payment, Profile, Subscription } from '@/lib/types';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Card, Field, Input, Notice, inputClass } from '@/components/ui';
import { deleteMember, sendResetLink, setRole, toggleSuspension } from './actions';

export const metadata = { title: 'Membres' };
const PAGE = 25;

const FILTERS = { tous: 'Tous', payants: 'Payants', gratuits: 'Gratuits', suspendus: 'Suspendus', admins: 'Admins' } as const;

export default async function MembersPage(props: PageProps<'/admin/membres'>) {
  const { session } = await requireAdmin('/admin/membres');
  const sp = await props.searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 80).replace(/[%_,()]/g, '') : '';
  const filtre = typeof sp.filtre === 'string' && sp.filtre in FILTERS ? (sp.filtre as keyof typeof FILTERS) : 'tous';
  const page = Math.max(0, Number(sp.page) || 0);
  const selectedId = typeof sp.id === 'string' ? sp.id : null;

  const supabase = await createClient();
  let query = supabase.from('profiles').select('*', { count: 'exact' }).order('created_at', { ascending: false });
  if (q) query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%,farm_name.ilike.%${q}%`);
  if (filtre === 'payants') query = query.neq('plan', 'free');
  if (filtre === 'gratuits') query = query.eq('plan', 'free');
  if (filtre === 'suspendus') query = query.eq('suspended', true);
  if (filtre === 'admins') query = query.eq('role', 'admin');
  const { data, count } = await query.range(page * PAGE, page * PAGE + PAGE - 1);
  const members = (data ?? []) as Profile[];

  // Détail du membre sélectionné
  let selected: Profile | null = null;
  let subs: Subscription[] = [];
  let payments: Payment[] = [];
  let usage = { parcels: 0, machines: 0 };
  if (selectedId && /^[0-9a-f-]{36}$/.test(selectedId)) {
    const [{ data: p }, { data: s }, { data: pay }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', selectedId).maybeSingle(),
      supabase.from('subscriptions').select('*').eq('user_id', selectedId).order('created_at', { ascending: false }),
      supabase.from('payments').select('*').eq('user_id', selectedId).order('created_at', { ascending: false }).limit(5),
    ]);
    selected = p as Profile | null;
    subs = (s ?? []) as Subscription[];
    payments = (pay ?? []) as Payment[];
    if (selected) {
      // Comptage seulement : l'admin ne lit pas le contenu des exploitations.
      const service = createServiceClient();
      const [parcels, machines] = await Promise.all([
        service.from('parcels').select('id', { count: 'exact', head: true }).eq('user_id', selected.id),
        service.from('machines').select('id', { count: 'exact', head: true }).eq('user_id', selected.id),
      ]);
      usage = { parcels: parcels.count ?? 0, machines: machines.count ?? 0 };
    }
  }

  const link = (params: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    const merged = { q: q || undefined, filtre: filtre !== 'tous' ? filtre : undefined, page: page || undefined, ...params };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== '') u.set(k, String(v));
    return `/admin/membres?${u}`;
  };
  const recentMfa = hasRecentMfa(session);

  return (
    <>
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Membres</h1>
        <p className="text-muted">{count ?? 0} compte{(count ?? 0) > 1 ? 's' : ''}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <form className="w-full max-w-sm">
          <label htmlFor="q" className="sr-only">Rechercher un membre</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Nom, exploitation, e-mail…" className={inputClass} />
          {filtre !== 'tous' ? <input type="hidden" name="filtre" value={filtre} /> : null}
        </form>
        {Object.entries(FILTERS).map(([k, label]) => (
          <Link key={k} href={link({ filtre: k === 'tous' ? undefined : k, page: undefined })} className={`rounded-full px-3.5 py-2 text-[15px] ${filtre === k ? 'bg-admin font-semibold text-white' : 'border border-field bg-white'}`}>
            {label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <section className="min-w-0 flex-[2_1_560px] overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr className="bg-[#fafbf9] text-left text-[13px] text-muted">
                {['Exploitation', 'Formule', 'Statut', 'Inscrit le'].map((h) => <th key={h} className="border-b border-line px-4 py-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className={m.id === selected?.id ? 'bg-brand-tint' : 'hover:bg-ground'}>
                  <td className="border-b border-[#eef0eb] px-4 py-3.5">
                    <Link href={link({ id: m.id })} className="block text-ink">
                      <strong className="font-semibold">{m.farm_name || m.full_name || '—'}</strong>
                      <br />
                      <span className="text-muted">{m.full_name} · {maskEmail(m.email)}</span>
                    </Link>
                  </td>
                  <td className="border-b border-[#eef0eb] px-4 py-3.5">{PLANS[m.plan].name}{m.role === 'admin' ? ' · admin' : ''}</td>
                  <td className="border-b border-[#eef0eb] px-4 py-3.5">{m.suspended ? <Badge tone="red">Suspendu</Badge> : <Badge tone="green">Actif</Badge>}</td>
                  <td className="border-b border-[#eef0eb] px-4 py-3.5">{formatDate(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-3 text-sm text-muted">
            <span>{page * PAGE + 1}–{page * PAGE + members.length} sur {count ?? 0}</span>
            <span className="flex gap-3">
              {page > 0 ? <Link href={link({ page: page - 1 })} className="font-semibold text-brand">Précédent</Link> : null}
              {(page + 1) * PAGE < (count ?? 0) ? <Link href={link({ page: page + 1 })} className="font-semibold text-brand">Suivant</Link> : null}
            </span>
          </div>
        </section>

        <Card className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          {!selected ? (
            <p className="text-muted">Sélectionnez un membre pour voir le détail.</p>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-bold">{selected.farm_name || selected.full_name}</h2>
                <p className="text-sm text-muted">{selected.full_name} · membre depuis {formatDate(selected.created_at, { month: 'long', year: 'numeric', day: undefined })}</p>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted">E-mail</dt><dd className="break-all">{selected.email}</dd>
                <dt className="text-muted">Formule</dt><dd>{PLANS[selected.plan].name}{subs[0] ? ` · ${subs[0].status}` : ''}</dd>
                {subs[0]?.current_period_end ? (<><dt className="text-muted">Échéance</dt><dd>{formatDate(subs[0].current_period_end)}</dd></>) : null}
                <dt className="text-muted">Utilisation</dt><dd>{usage.parcels} parcelles · {usage.machines} machines</dd>
                <dt className="text-muted">Rôle</dt><dd>{selected.role === 'admin' ? 'Administrateur' : 'Membre'}</dd>
              </dl>
              {payments.length ? (
                <div>
                  <h3 className="mb-1.5 text-[15px] font-semibold">Derniers paiements</h3>
                  <ul className="text-sm">
                    {payments.map((p) => (
                      <li key={p.id} className="flex justify-between border-b border-[#eef0eb] py-2">
                        <span>{formatDate(p.created_at)}</span>
                        <span>{formatEuros(p.amount_cents, p.currency)} · <span className={p.status === 'paid' ? 'text-brand' : 'text-warn'}>{p.status === 'paid' ? 'payé' : p.status === 'failed' ? 'échec' : 'remboursé'}</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {selected.id !== session.userId ? (
                <div className="flex flex-col gap-2">
                  {!recentMfa ? (
                    <Notice>
                      Actions sensibles : <Link href={`/securite/2fa?forcer=1&suite=${encodeURIComponent(link({ id: selected.id }))}`} className="font-semibold underline">validez à nouveau votre code</Link> (valable 15 min).
                    </Notice>
                  ) : null}
                  <ActionForm action={sendResetLink} className="flex flex-col gap-2">
                    <input type="hidden" name="user_id" value={selected.id} />
                    <SubmitButton variant="secondary">Envoyer un lien de réinitialisation</SubmitButton>
                  </ActionForm>
                  <a href={`/api/admin/membres/${selected.id}/export`} className="inline-flex min-h-12 items-center justify-center rounded-[10px] border border-field bg-white px-5 font-semibold" download>
                    Exporter ses données (RGPD)
                  </a>
                  <ActionForm action={setRole} className="flex flex-col gap-2">
                    <input type="hidden" name="user_id" value={selected.id} />
                    <input type="hidden" name="role" value={selected.role === 'admin' ? 'member' : 'admin'} />
                    <SubmitButton variant="secondary">{selected.role === 'admin' ? 'Retirer les droits admin' : 'Donner les droits admin'}</SubmitButton>
                  </ActionForm>
                  <ActionForm action={toggleSuspension} className="flex flex-col gap-2">
                    <input type="hidden" name="user_id" value={selected.id} />
                    <SubmitButton variant="danger">{selected.suspended ? 'Réactiver le compte' : 'Suspendre le compte'}</SubmitButton>
                  </ActionForm>
                  <details className="rounded-xl border border-[#e3b7b0] p-3.5">
                    <summary className="cursor-pointer font-semibold text-danger">Supprimer le compte</summary>
                    <ActionForm action={deleteMember} className="mt-3 flex flex-col gap-2">
                      <input type="hidden" name="user_id" value={selected.id} />
                      <Field label={`Recopiez ${selected.email} pour confirmer`} htmlFor="confirm">
                        <Input id="confirm" name="confirm" autoComplete="off" required />
                      </Field>
                      <SubmitButton variant="danger" pendingLabel="Suppression…">Supprimer définitivement</SubmitButton>
                    </ActionForm>
                  </details>
                  <p className="text-[13px] text-muted">Toutes ces actions sont enregistrées dans le journal.</p>
                </div>
              ) : (
                <p className="text-sm text-muted">C’est votre compte.</p>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
