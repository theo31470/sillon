import Image from 'next/image';
import Link from 'next/link';
import { Logo, btn } from '@/components/ui';
import { LatestPosts } from '@/components/latest-posts';
import { ListingCard } from '@/components/listing-card';
import { MachineScene, FurrowBand } from '@/components/sheets/machine-art';
import { Icon, type IconName } from '@/components/sheets/icons';
import { listPublishedSheets } from '@/lib/content';
import { searchListings } from '@/lib/bourse';
import { BUYER_FEE } from '@/lib/bourse-shared';
import { keyFigures, machineKind } from '@/lib/sheets/insights';
import { parseSheetContent } from '@/lib/sheets/schema';
import { FREE_MACHINE_LIMIT } from '@/lib/plans';
import heroPhoto from '../../../public/photos/accueil-travail-du-sol.jpg';
import captureDashboard from '../../../public/captures/tableau-de-bord.webp';
import captureDue from '../../../public/captures/echeances.webp';

const n = (v: number) => v.toLocaleString('fr-FR');
const feeLabel = `${(BUYER_FEE.fixed / 100).toFixed(2).replace('.', ',')} € + ${BUYER_FEE.rate * 100} %`;

const faq = [
  { q: 'Qu’est-ce que Tracteurs & Co ?', a: 'Un site fait pour le matériel agricole : un carnet d’entretien en ligne pour votre parc, une base de fiches techniques en accès libre, et une bourse pour acheter et vendre du matériel d’occasion entre agriculteurs.' },
  { q: 'Qu’est-ce qui est gratuit ?', a: `Les fiches techniques sont en accès libre. Le compte est gratuit : il donne la gestion de parc jusqu’à ${FREE_MACHINE_LIMIT} machines et la bourse (annonces, messagerie). La formule Complet ajoute les machines illimitées, le coût de revient, l’aide au diagnostic, la facture du garage en photo, le partage avec l’équipe et l’estimation du prix de revente.` },
  { q: 'Combien coûte une vente sur la bourse ?', a: `Rien pour le vendeur : annonce gratuite, sans commission. L’acheteur qui paie en ligne règle de petits frais de service (${feeLabel}, 40 € au plus) qui couvrent le paiement sécurisé.` },
  { q: 'Comment l’argent est-il protégé ?', a: 'L’acheteur paie sur le site ; l’argent est mis de côté et n’est versé au vendeur qu’à la remise en main propre (avec un code) ou à la livraison du colis. En cas de problème, notre équipe tranche et rembourse si besoin.' },
  { q: 'Mes données sont-elles à moi ?', a: 'Oui. Vous pouvez les exporter ou demander leur suppression à tout moment. Votre téléphone et votre adresse ne sont jamais affichés sur la bourse.' },
];

export default async function HomePage() {
  const [allSheets, listings] = await Promise.all([
    listPublishedSheets(),
    searchListings({ page: 1 }).catch(() => ({ listings: [], total: 0, page: 1 })),
  ]);
  const machines = allSheets.filter((s) => s.category === 'machine');
  const sheets = (machines.length >= 3 ? machines : allSheets).slice(0, 3);
  const latest = listings.listings.slice(0, 4);

  const universes: { id: string; eyebrow: string; title: string; text: string; points: string[]; href: string; cta: string; icon: IconName; stat: string | null }[] = [
    {
      id: 'parc',
      eyebrow: 'Gérer',
      title: 'Mon parc matériel',
      text: 'Le carnet de santé de vos tracteurs et outils, sur le téléphone.',
      points: ['Entretiens et rappels automatiques', 'Coût de revient à l’heure', 'Aide au diagnostic de panne'],
      href: '/gestion-de-parc',
      cta: 'Découvrir',
      icon: 'wrench',
      stat: `Gratuit jusqu’à ${FREE_MACHINE_LIMIT} machines`,
    },
    {
      id: 'fiches',
      eyebrow: 'S’informer',
      title: 'Fiches techniques',
      text: 'Caractéristiques, entretien et pannes connues de chaque modèle, sources citées.',
      points: ['Plan d’entretien constructeur', 'Pannes connues et tests à faire', 'Conseils et guides pratiques'],
      href: '/fiches',
      cta: 'Chercher un modèle',
      icon: 'book',
      stat: allSheets.length ? `${n(allSheets.length)} fiches en accès libre` : 'En accès libre',
    },
    {
      id: 'bourse',
      eyebrow: 'Acheter & vendre',
      title: 'Bourse au matériel',
      text: 'Tracteurs, outils, pièces et pneus d’occasion entre agriculteurs.',
      points: ['Annonces gratuites, sans commission', 'Paiement sécurisé, argent protégé', 'Envoi en point relais ou main propre'],
      href: '/bourse',
      cta: 'Voir les annonces',
      icon: 'tag',
      stat: listings.total ? `${n(listings.total)} annonce${listings.total > 1 ? 's' : ''} en ligne` : 'Déposez la première annonce',
    },
  ];

  return (
    <>
      {/* Accroche */}
      <section className="relative isolate overflow-hidden bg-admin text-white">
        <Image src={heroPhoto} alt="" fill priority placeholder="blur" sizes="100vw" className="-z-10 object-cover object-[42%_62%] opacity-55" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/75 via-black/45 to-black/10" aria-hidden="true" />
        <div className="mx-auto max-w-6xl px-6 pb-28 pt-20 sm:pb-36 sm:pt-28">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold backdrop-blur">
            <Icon name="wrench" size={15} /> Machinisme agricole
          </p>
          <h1 className="mb-5 max-w-3xl text-[clamp(38px,5.2vw,64px)] font-bold leading-[1.04] tracking-tight">Tout pour votre matériel agricole, au même endroit.</h1>
          <p className="mb-8 max-w-2xl text-xl text-white/85">Suivez l’entretien de votre parc, trouvez la fiche technique d’une machine, achetez et vendez du matériel d’occasion entre agriculteurs.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/inscription" className={btn.primary}>Créer mon compte gratuit</Link>
            <Link href="/bourse" className="btn inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] border border-white/40 bg-white/10 px-5 py-3 font-semibold text-white backdrop-blur hover:bg-white/20">
              Voir les annonces
            </Link>
          </div>
        </div>
      </section>

      {/* Les trois univers */}
      <section aria-labelledby="univers" className="relative z-10 mx-auto -mt-20 max-w-6xl px-4 sm:-mt-24 sm:px-6">
        <h2 id="univers" className="sr-only">Ce que fait Tracteurs & Co</h2>
        <div className="grid gap-4 md:grid-cols-3 md:gap-5">
          {universes.map((u) => (
            <Link key={u.id} href={u.href} className="lift-card group flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-[0_24px_48px_-32px_rgba(0,0,0,0.5)] sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-11 flex-none items-center justify-center rounded-xl bg-brand-tint text-brand-dark">
                  <Icon name={u.icon} size={22} />
                </span>
                <span>
                  <span className="block text-xs font-bold uppercase tracking-[0.16em] text-brand">{u.eyebrow}</span>
                  <span className="block text-xl font-bold leading-tight">{u.title}</span>
                </span>
              </div>
              <p className="text-muted">{u.text}</p>
              <ul className="flex flex-col gap-1.5 text-[15px]">
                {u.points.map((p) => (
                  <li key={p} className="flex items-start gap-2">
                    <span className="mt-2 size-1.5 flex-none rounded-full bg-brand" aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex items-center justify-between gap-3 border-t border-line-soft pt-3">
                <span className="text-sm font-semibold text-soil">{u.stat}</span>
                <span className="font-semibold text-brand-dark group-hover:underline">{u.cta} →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Gérer */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-wrap items-center gap-10">
          <div className="min-w-0 flex-[1_1_380px]">
            <p className="mb-2 font-semibold text-brand">Gérer mon parc</p>
            <h2 className="mb-3 text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">Le carnet de santé de vos machines</h2>
            <p className="mb-6 text-muted">
              Choisissez le modèle : le plan d’entretien est repris de sa fiche technique. Les rappels tombent au premier terme atteint, heures ou mois. Dépenses, carburant et coût de revient à
              l’heure sont calculés machine par machine.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/gestion-de-parc" className={btn.primary}>Découvrir la gestion de parc</Link>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- navigation complète : la session de démo se pose par cookie */}
              <a href="/demo" className={btn.secondary}>Voir la démo</a>
            </div>
          </div>
          <div className="flex min-w-0 flex-[1_1_440px] items-start justify-center gap-4">
            <Image src={captureDashboard} alt="Tableau de bord de l’application : échéances de la semaine et heures de l’année" sizes="260px" className="w-[46%] max-w-[260px] rounded-2xl border border-line shadow-[0_30px_60px_-40px_rgba(0,0,0,0.6)]" />
            <Image src={captureDue} alt="Échéances d’entretien d’une machine, aux heures ou aux mois" sizes="260px" className="mt-10 w-[46%] max-w-[260px] rounded-2xl border border-line shadow-[0_30px_60px_-40px_rgba(0,0,0,0.6)]" />
          </div>
        </div>
      </section>

      {/* Acheter & vendre */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="mb-2 font-semibold text-brand">Acheter & vendre</p>
              <h2 className="mb-3 text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">La bourse au matériel</h2>
              <p className="text-muted">Annonces gratuites entre agriculteurs, messagerie protégée et paiement sécurisé : l’argent n’est versé au vendeur qu’une fois le matériel entre vos mains.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/bourse" className={btn.primary}>Toutes les annonces</Link>
              <Link href="/app/annonces/nouvelle" className={btn.secondary}>Vendre du matériel</Link>
            </div>
          </div>
          {latest.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {latest.map((l) => (
                <li key={l.id}>
                  <ListingCard l={l} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-ground px-5 py-6 text-muted">Les premières annonces arrivent : déposez la vôtre, c’est gratuit.</p>
          )}
        </div>
      </section>

      {/* S'informer */}
      <section className="bg-ground">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="mb-2 font-semibold text-brand">S’informer</p>
              <h2 className="mb-3 text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">Les fiches techniques</h2>
              <p className="text-muted">Caractéristiques, carnet d’entretien, pannes connues et tests à faire, avec les sources citées. Chaque fiche est relue avant publication.</p>
            </div>
            <Link href="/fiches" className={btn.primary}>Toutes les fiches</Link>
          </div>
          {sheets.length ? (
            <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
              {sheets.map((s) => {
                const figures = keyFigures(parseSheetContent(s.content), 2);
                return (
                  <Link key={s.id} href={`/fiches/${s.slug}`} transitionTypes={['nav-forward']} className="sheet-card group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink">
                    <div className="relative h-40 overflow-hidden bg-photo">
                      {s.cover_url ? (
                        <Image src={s.cover_url} alt="" fill sizes="320px" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <MachineScene kind={machineKind(s)} uid={`h-${s.id}`} label="" className="size-full" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      {s.brand ? <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">{s.brand}</p> : null}
                      <h3 className="text-lg font-semibold">{s.title}</h3>
                      <p className="mt-auto flex flex-wrap gap-1.5">
                        {figures.map((f) => <span key={f.key} className="rounded-full bg-wheat-soft px-2.5 py-0.5 text-[13px] font-semibold text-soil">{f.main}</span>)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      <LatestPosts />

      <section className="bg-ground">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="mb-8 text-center text-[clamp(28px,3vw,36px)] font-bold tracking-tight">Questions fréquentes</h2>
          <div className="border-t border-line">
            {faq.map((item) => (
              <details key={item.q} className="border-b border-line py-5">
                <summary className="cursor-pointer text-lg font-semibold transition-colors hover:text-brand">{item.q}</summary>
                <p className="mt-3 text-muted">{item.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-center text-muted">
            Formules et prix de la gestion de parc :{' '}
            <Link href="/tarifs" className="font-semibold text-brand-dark underline underline-offset-4">voir les tarifs</Link>
          </p>
        </div>
      </section>

      <section className="relative overflow-hidden bg-admin text-white">
        <FurrowBand className="absolute inset-x-0 top-0 block h-4 w-full text-brand/40" />
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-16">
          <div className="flex items-center gap-6">
            <Logo variant="embleme" tone="dark" height={96} className="hidden flex-none sm:inline-flex" />
            <div>
              <h2 className="mb-1.5 text-[clamp(26px,3vw,34px)] font-bold tracking-tight">Un seul compte pour tout</h2>
              <p className="text-panel-muted">Votre parc, vos annonces, vos messages. Gratuit, sans carte bancaire.</p>
            </div>
          </div>
          <Link href="/inscription" className={btn.primary}>Créer mon compte</Link>
        </div>
      </section>
    </>
  );
}
