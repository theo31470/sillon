import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import { CONTACT_STATUSES, CONTACT_TOPICS, type ContactMessage, type ContactStatus } from '@/lib/contact';
import { Badge, Notice, inputClass } from '@/components/ui';

export const metadata: Metadata = { title: 'Messages' };
export const dynamic = 'force-dynamic';
const PAGE = 30;

const TONES: Record<ContactStatus, 'blue' | 'amber' | 'green' | 'gray'> = { nouveau: 'blue', en_cours: 'amber', traite: 'green', archive: 'gray' };
const when = (iso: string) => formatDate(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default async function MessagesPage(props: PageProps<'/admin/messages'>) {
  await requireAdmin('/admin/messages');
  const sp = await props.searchParams;
  const statut = typeof sp.statut === 'string' && (sp.statut in CONTACT_STATUSES || sp.statut === 'tous') ? sp.statut : 'a_traiter';
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 80).replace(/[%_,()\\]/g, '') : '';
  const page = Math.max(0, Number(sp.page) || 0);
  const supabase = await createClient();

  let query = supabase.from('contact_messages').select('id, name, email, farm_name, topic, message, status, created_at, replies, user_id', { count: 'exact' }).order('created_at', { ascending: false });
  if (statut === 'a_traiter') query = query.in('status', ['nouveau', 'en_cours']);
  else if (statut !== 'tous') query = query.eq('status', statut);
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,farm_name.ilike.%${q}%,message.ilike.%${q}%`);

  const counts = async (s: ContactStatus) => (await supabase.from('contact_messages').select('id', { count: 'exact', head: true }).eq('status', s)).count ?? 0;
  const [{ data, count }, nouveau, en_cours, traite, archive] = await Promise.all([
    query.range(page * PAGE, page * PAGE + PAGE - 1),
    counts('nouveau'),
    counts('en_cours'),
    counts('traite'),
    counts('archive'),
  ]);
  const rows = (data ?? []) as Pick<ContactMessage, 'id' | 'name' | 'email' | 'farm_name' | 'topic' | 'message' | 'status' | 'created_at' | 'replies' | 'user_id'>[];
  const total = count ?? 0;
  const tiles: { key: string; label: string; n: number; warn?: boolean }[] = [
    { key: 'a_traiter', label: 'À traiter', n: nouveau + en_cours, warn: nouveau > 0 },
    { key: 'nouveau', label: 'Nouveaux', n: nouveau },
    { key: 'en_cours', label: 'En cours', n: en_cours },
    { key: 'traite', label: 'Traités', n: traite },
    { key: 'archive', label: 'Archivés', n: archive },
    { key: 'tous', label: 'Tous', n: nouveau + en_cours + traite + archive },
  ];
  const link = (params: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    const merged = { statut: statut !== 'a_traiter' ? statut : undefined, q: q || undefined, page: page || undefined, ...params };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== '') u.set(k, String(v));
    const s = u.toString();
    return `/admin/messages${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Messages</h1>
        <p className="text-muted">Messages reçus par le formulaire de contact. Vous êtes aussi prévenu par e-mail à chaque nouveau message.</p>
      </div>
      {sp.supprime ? <Notice tone="green">Message supprimé.</Notice> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => {
          const active = statut === t.key;
          return (
            <Link
              key={t.key}
              href={link({ statut: t.key === 'a_traiter' ? undefined : t.key, page: undefined })}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col gap-1 rounded-xl border px-4 py-3.5 transition-colors ${active ? 'border-brand bg-brand-tint' : t.warn ? 'border-info/40 bg-info-soft hover:border-info' : 'border-line bg-surface hover:border-brand'}`}
            >
              <span className="text-[13px] text-muted">{t.label}</span>
              <span className={`text-2xl font-bold tabular-nums ${t.warn ? 'text-info' : ''}`}>{t.n}</span>
            </Link>
          );
        })}
      </div>

      <form action="/admin/messages" className="max-w-md">
        <label htmlFor="q" className="sr-only">Rechercher</label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Nom, e-mail, exploitation, contenu…" className={inputClass} />
        {statut !== 'a_traiter' ? <input type="hidden" name="statut" value={statut} /> : null}
      </form>

      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        {rows.length ? (
          <ul className="divide-y divide-line-soft">
            {rows.map((m) => (
              <li key={m.id}>
                <Link href={`/admin/messages/${m.id}`} className={`grid gap-1 px-5 py-4 transition-colors hover:bg-ground md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] md:items-center md:gap-5 ${m.status === 'nouveau' ? 'bg-info-soft/40' : ''}`}>
                  <span className="min-w-0">
                    <span className={`block truncate ${m.status === 'nouveau' ? 'font-bold' : 'font-semibold'}`}>{m.name}</span>
                    <span className="block truncate text-sm text-muted">{m.farm_name || m.email}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{CONTACT_TOPICS[m.topic]}{m.user_id ? <span className="font-normal text-muted"> · membre</span> : null}</span>
                    <span className="block truncate text-sm text-muted">{m.message}</span>
                  </span>
                  <span className="flex items-center gap-2 text-sm text-muted md:flex-col md:items-end">
                    <Badge tone={TONES[m.status]}>{CONTACT_STATUSES[m.status]}</Badge>
                    <span className="whitespace-nowrap">{when(m.created_at)}{m.replies?.length ? ` · ${m.replies.length} réponse${m.replies.length > 1 ? 's' : ''}` : ''}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center text-muted">{statut === 'a_traiter' && !q ? 'Aucun message à traiter. 👍' : 'Aucun message.'}</p>
        )}
        {total > PAGE ? (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm text-muted">
            <span>{page * PAGE + 1}–{page * PAGE + rows.length} sur {total}</span>
            <span className="flex gap-3">
              {page > 0 ? <Link href={link({ page: page - 1 })} className="font-semibold text-brand">← Précédents</Link> : null}
              {(page + 1) * PAGE < total ? <Link href={link({ page: page + 1 })} className="font-semibold text-brand">Suivants →</Link> : null}
            </span>
          </div>
        ) : null}
      </section>
    </>
  );
}
