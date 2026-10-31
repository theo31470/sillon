import type { Metadata } from 'next';
import type Stripe from 'stripe';
import { requireAdmin } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { frenchDate } from '@/lib/invoices/types';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Card, Field, Input, Notice, Select } from '@/components/ui';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatCents } from '@/lib/invoices/types';
import { REFERRAL_REWARD_CENTS } from '@/lib/referrals';
import { createPromoCode, setPromoCodeActive } from '../factures/actions';

export const metadata: Metadata = { title: 'Codes promo' };
export const dynamic = 'force-dynamic';

function describe(coupon: Stripe.Coupon | null) {
  if (!coupon) return { off: '—', duration: '' };
  const off = coupon.percent_off ? `−${String(coupon.percent_off).replace('.', ',')} %` : coupon.amount_off ? `−${(coupon.amount_off / 100).toFixed(2).replace('.', ',')} €` : '—';
  const duration =
    coupon.duration === 'once' ? 'sur le premier paiement' : coupon.duration === 'forever' ? 'sur tous les paiements' : `pendant ${coupon.duration_in_months} mois`;
  return { off, duration };
}

/** Date Stripe (secondes) passée ? */
function isPast(unix: number | null) {
  return unix ? unix * 1000 < Date.now() : false;
}

export default async function PromoCodesPage() {
  await requireAdmin('/admin/codes-promo');
  let codes: Stripe.PromotionCode[] = [];
  let failed = false;
  try {
    codes = (await stripe().promotionCodes.list({ limit: 100, expand: ['data.promotion.coupon'] })).data;
  } catch (err) {
    console.error('[codes promo]', err);
    failed = true;
  }
  const supabase = await createClient();
  const { data: refRows } = await supabase
    .from('referrals')
    .select('id, status, created_at, rewarded_at, referrer:profiles!referrals_referrer_id_fkey(id, full_name, farm_name, email), referee:profiles!referrals_referee_id_fkey(id, full_name, farm_name, email)')
    .order('created_at', { ascending: false })
    .limit(100);
  type Person = { id: string; full_name: string; farm_name: string; email: string } | null;
  const referrals = (refRows ?? []) as unknown as { id: string; status: string; created_at: string; rewarded_at: string | null; referrer: Person; referee: Person }[];
  const who = (p: Person) => (p ? p.farm_name || p.full_name || p.email : 'Compte supprimé');
  const rewarded = referrals.filter((r) => r.status === 'recompense').length;

  return (
    <>
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Codes promo</h1>
        <p className="text-muted">Les membres les saisissent sur la page Abonnement, au moment de souscrire. La remise apparaît sur leurs factures. Le parrainage est en bas de page.</p>
      </div>
      {failed ? <Notice tone="red">Stripe ne répond pas : la liste des codes est momentanément indisponible.</Notice> : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 font-semibold">{codes.length} code{codes.length > 1 ? 's' : ''}</h2>
          {codes.length === 0 ? (
            <p className="px-4 py-10 text-center text-muted">Aucun code pour le moment.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {codes.map((p) => {
                const coupon = p.promotion?.coupon && typeof p.promotion.coupon !== 'string' ? p.promotion.coupon : null;
                const { off, duration } = describe(coupon);
                const expired = isPast(p.expires_at);
                const exhausted = p.max_redemptions ? p.times_redeemed >= p.max_redemptions : false;
                const live = p.active && !expired && !exhausted;
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[15px] font-bold">{p.code}</span>
                        {live ? <Badge tone="green">Actif</Badge> : expired ? <Badge>Expiré</Badge> : exhausted ? <Badge>Épuisé</Badge> : <Badge tone="gray">Désactivé</Badge>}
                        {p.restrictions?.first_time_transaction ? <Badge tone="blue">1er abonnement</Badge> : null}
                      </p>
                      <p className="text-sm text-muted">
                        <strong className="text-ink">{off}</strong> {duration} · utilisé {p.times_redeemed} fois{p.max_redemptions ? ` sur ${p.max_redemptions}` : ''}
                        {p.expires_at ? ` · ${expired ? 'expiré' : 'expire'} le ${frenchDate(p.expires_at)}` : ''}
                      </p>
                    </div>
                    {!expired && !exhausted ? (
                      <ActionForm action={setPromoCodeActive} resetOnSuccess={false} className="flex flex-col gap-2">
                        <input type="hidden" name="promo_id" value={p.id} />
                        <input type="hidden" name="active" value={p.active ? '0' : '1'} />
                        <SubmitButton variant={p.active ? 'danger' : 'small'} pendingLabel="…">{p.active ? 'Désactiver' : 'Réactiver'}</SubmitButton>
                      </ActionForm>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <Card>
          <h2 className="mb-1 text-xl font-semibold">Nouveau code</h2>
          <p className="mb-4 text-sm text-muted">Ex. SALON2027 pour un salon, PARRAIN pour le bouche-à-oreille.</p>
          <ActionForm action={createPromoCode} className="flex flex-col gap-3">
            <Field label="Code" htmlFor="code" hint="Lettres, chiffres et tirets. Insensible à la casse pour le membre.">
              <Input id="code" name="code" required maxLength={30} className="font-mono uppercase" placeholder="SALON2027" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Réduction" htmlFor="valeur">
                <Input id="valeur" name="valeur" inputMode="decimal" required placeholder="20" />
              </Field>
              <Field label="En" htmlFor="type">
                <Select id="type" name="type" defaultValue="pourcent">
                  <option value="pourcent">%</option>
                  <option value="montant">€</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Appliquée" htmlFor="duree">
                <Select id="duree" name="duree" defaultValue="once">
                  <option value="once">Au 1er paiement</option>
                  <option value="repeating">Pendant X mois</option>
                  <option value="forever">Toujours</option>
                </Select>
              </Field>
              <Field label="Nombre de mois" htmlFor="mois" hint="Pour « pendant X mois ».">
                <Input id="mois" name="mois" type="number" min={1} max={36} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Utilisations max." htmlFor="max" hint="Vide : illimité.">
                <Input id="max" name="max" type="number" min={1} />
              </Field>
              <Field label="Expire le" htmlFor="expire" hint="Vide : sans fin.">
                <Input id="expire" name="expire" type="date" />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="premier" className="size-4 accent-brand" /> Réservé à un premier abonnement
            </label>
            <Field label="Nom interne (facultatif)" htmlFor="nom">
              <Input id="nom" name="nom" maxLength={60} placeholder="Salon de Rennes 2027" />
            </Field>
            <SubmitButton pendingLabel="Création…">Créer le code</SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Parrainages</h2>
            <p className="text-sm text-muted">
              Chaque membre a son code personnel (page Abonnement). Le filleul a {formatCents(REFERRAL_REWARD_CENTS)} de remise sur son premier paiement ; le parrain reçoit{' '}
              {formatCents(REFERRAL_REWARD_CENTS)} de crédit à son premier vrai paiement.
            </p>
          </div>
          <p className="text-sm">
            <strong>{referrals.length}</strong> filleul{referrals.length > 1 ? 's' : ''} · <strong>{rewarded}</strong> mois offert{rewarded > 1 ? 's' : ''} aux parrains
          </p>
        </div>
        {referrals.length === 0 ? (
          <p className="p-5 text-sm text-muted">Aucun parrainage pour le moment.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {referrals.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <span className="min-w-0 flex-[1_1_260px]">
                  {r.referrer ? <Link href={`/admin/membres/${r.referrer.id}`} className="font-semibold text-ink hover:text-brand">{who(r.referrer)}</Link> : who(r.referrer)}
                  <span className="text-muted"> a invité </span>
                  {r.referee ? <Link href={`/admin/membres/${r.referee.id}`} className="font-semibold text-ink hover:text-brand">{who(r.referee)}</Link> : who(r.referee)}
                </span>
                <span className="text-muted">{frenchDate(r.created_at)}</span>
                {r.status === 'recompense' ? <Badge tone="green">Mois crédité</Badge> : r.status === 'annule' ? <Badge tone="gray">Annulé</Badge> : <Badge tone="amber">En attente du 1er paiement</Badge>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
