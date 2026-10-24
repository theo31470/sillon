import Image from 'next/image';
import Link from 'next/link';
import { CheckIcon, btn } from '@/components/ui';
import { PricingCards } from '@/components/pricing-cards';
import { LatestPosts } from '@/components/latest-posts';
import { MachineScene, FurrowBand } from '@/components/sheets/machine-art';
import { Icon, type IconName } from '@/components/sheets/icons';
import { listPublishedSheets } from '@/lib/content';
import { keyFigures, machineKind } from '@/lib/sheets/insights';
import { parseSheetContent } from '@/lib/sheets/schema';
import { FREE_MACHINE_LIMIT } from '@/lib/plans';

const features: { icon: IconName; title: string; text: string }[] = [
  { icon: 'wrench', title: 'Carnet d’entretien automatique', text: 'Choisissez le modèle de votre machine : vidanges, filtres et graissages sont repris de sa fiche technique.' },
  { icon: 'clock', title: 'Rappels au bon moment', text: 'Chaque échéance tombe au premier terme atteint, heures moteur ou mois. Plus de vidange oubliée.' },
  { icon: 'power', title: 'Coût de revient à l’heure', text: 'Amortissement, gazole, entretien, réparations : le vrai coût de chaque heure de travail, machine par machine.' },
  { icon: 'can', title: 'Dépenses et carburant', text: 'Pleins, factures d’atelier, pneus, assurance : tout est rattaché à la machine, avec la consommation en L/h.' },
  { icon: 'book', title: 'Fiches techniques', text: 'Caractéristiques, plan d’entretien, pannes connues et tests à faire, avec les sources citées.' },
  { icon: 'print', title: 'Rapport pour la revente', text: 'Un historique d’entretien propre à remettre à l’acheteur : votre matériel se vend mieux.' },
];

const audiences = [
  { icon: 'tag' as IconName, title: 'Exploitants', text: 'Suivez vos tracteurs et outils sans paperasse, depuis le téléphone.' },
  { icon: 'hitch' as IconName, title: 'CUMA', text: 'Coût horaire réel de chaque machine pour fixer des tarifs justes.' },
  { icon: 'gear' as IconName, title: 'Entrepreneurs de travaux', text: 'Marge par machine et entretien d’une flotte qui tourne beaucoup.' },
];

const faq = [
  { q: 'Faut-il être à l’aise avec l’informatique ?', a: 'Non. Relever un compteur ou noter une vidange prend dix secondes, avec de gros boutons pensés pour le téléphone.' },
  { q: 'Mon modèle de tracteur n’a pas de fiche technique ?', a: 'Vous pouvez quand même l’ajouter et créer votre propre plan d’entretien. La base de fiches s’enrichit chaque semaine.' },
  { q: 'Comment est calculé le coût de revient ?', a: 'Charges fixes (amortissement, frais financiers, assurance) divisées par vos heures annuelles, plus les charges variables (carburant, entretien, réparations) rapportées aux heures travaillées. Les heures viennent de vos relevés de compteur.' },
  { q: 'Mes données sont-elles à moi ?', a: 'Oui. Vous pouvez les exporter ou demander leur suppression à tout moment.' },
  { q: 'Puis-je arrêter quand je veux ?', a: 'Oui, l’abonnement est sans engagement et se résilie en un clic depuis votre espace.' },
];

const example = [
  { label: 'Amortissement', value: 21.4, color: 'bg-soil' },
  { label: 'Frais financiers et assurance', value: 4.6, color: 'bg-[#a8865a]' },
  { label: 'Carburant', value: 14.2, color: 'bg-wheat' },
  { label: 'Entretien et réparations', value: 6.3, color: 'bg-brand' },
];
const exampleTotal = example.reduce((s, e) => s + e.value, 0);
const eur = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function HomePage() {
  const sheets = (await listPublishedSheets({ category: 'machine' })).slice(0, 3);

  return (
    <>
      {/* Accroche */}
      <section className="relative overflow-hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-14 px-6 pb-20 pt-16">
          <div className="min-w-0 flex-[1_1_440px]">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-wheat-soft px-3 py-1 text-sm font-semibold text-soil">
              <Icon name="wrench" size={15} /> Machinisme agricole
            </p>
            <h1 className="mb-5 text-[clamp(38px,4.8vw,58px)] font-bold leading-[1.05] tracking-tight">
              Le carnet de santé de votre matériel agricole.
            </h1>
            <p className="mb-8 max-w-xl text-xl text-muted">
              Entretiens, compteurs, dépenses et coût de revient à l’heure de chaque machine, au même endroit. Simple, depuis le téléphone.
            </p>
            <div className="mb-6 flex flex-wrap gap-3">
              <Link href="/inscription" className={btn.primary}>Essayer gratuitement</Link>
              <Link href="/fiches" className={btn.secondary}>Voir les fiches techniques</Link>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-muted">
              {[`Gratuit jusqu’à ${FREE_MACHINE_LIMIT} machines`, 'Sans engagement', 'Vos données vous appartiennent'].map((t) => (
                <li key={t} className="flex items-center gap-2"><CheckIcon className="text-brand" />{t}</li>
              ))}
            </ul>
          </div>

          <div className="relative min-w-0 flex-[1_1_480px]">
            <div className="overflow-hidden rounded-3xl border border-line shadow-[0_30px_60px_-40px_rgba(29,36,32,0.5)]">
              <MachineScene kind="tracteur" uid="accueil" tall label="Illustration : tracteur dans un champ labouré" className="hero-scene block h-[420px] w-full" />
            </div>
            <div className="figure absolute -left-2 top-8 w-64 max-w-[78%] rounded-2xl bg-white p-4 shadow-[0_16px_36px_rgba(29,36,32,0.18)] sm:-left-6" style={{ animationDelay: '350ms' }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Prochain entretien</p>
              <p className="mb-2 font-semibold">Vidange moteur</p>
              <div className="mb-1.5 h-2 overflow-hidden rounded-full bg-[#eef0eb]"><div className="hour-fill h-full w-[82%] rounded-full bg-[#d99a2b]" /></div>
              <p className="text-sm font-semibold text-warn">dans 42 h ou 3 semaines</p>
            </div>
            <div className="figure absolute -right-2 bottom-8 w-60 max-w-[75%] rounded-2xl bg-admin p-4 text-white shadow-[0_16px_36px_rgba(29,36,32,0.3)] sm:-right-6" style={{ animationDelay: '550ms' }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#9fb3a4]">Coût de revient</p>
              <p className="text-3xl font-bold tabular-nums">{eur(exampleTotal)} €<span className="text-base font-medium text-[#b9c7bd]"> / h</span></p>
              <p className="text-sm text-[#b9c7bd]">Tracteur 180 ch · exemple</p>
            </div>
          </div>
        </div>
        <FurrowBand className="block h-4 w-full text-brand-soft" />
      </section>

      {/* Pour qui */}
      <section className="bg-ground">
        <div className="mx-auto grid max-w-6xl gap-5 px-6 py-12 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {audiences.map((a) => (
            <div key={a.title} className="reveal flex items-start gap-3.5">
              <span className="flex size-11 flex-none items-center justify-center rounded-xl bg-white text-brand shadow-sm"><Icon name={a.icon} size={22} /></span>
              <div>
                <h2 className="font-semibold">{a.title}</h2>
                <p className="text-[15px] text-muted">{a.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Fonctionnalités */}
      <section id="fonctions" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
        <h2 className="mb-3 text-center text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">Tout votre matériel, bien suivi</h2>
        <p className="mx-auto mb-12 max-w-xl text-center text-muted">Moins de pannes, des entretiens faits à temps, et enfin le vrai coût de chaque machine.</p>
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
          {features.map((f) => (
            <article key={f.title} className="lift-card reveal group rounded-2xl border border-line bg-white p-6">
              <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-brand-tint text-brand transition-colors duration-300 group-hover:bg-brand group-hover:text-white">
                <Icon name={f.icon} size={24} />
              </span>
              <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
              <p className="text-[15px] text-muted">{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Coût de revient */}
      <section className="bg-admin text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-14 px-6 py-20">
          <div className="min-w-0 flex-[1_1_420px]">
            <p className="mb-2 font-semibold text-[#d9b45a]">Coût de revient</p>
            <h2 className="mb-4 text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">Combien vous coûte vraiment une heure de tracteur ?</h2>
            <p className="mb-6 text-[#b9c7bd]">
              Sillon additionne l’amortissement, les frais financiers, l’assurance, le gazole, l’entretien et les réparations, puis les rapporte à vos heures réelles de travail, d’après vos relevés de compteur.
            </p>
            <ul className="flex flex-col gap-3 text-[#dde6de]">
              {['Comparez vos machines entre elles', 'Fixez un tarif juste en CUMA ou en prestation', 'Voyez votre marge si vous facturez à l’heure'].map((t) => (
                <li key={t} className="flex gap-2.5"><CheckIcon className="mt-1 flex-none text-[#9fd3a3]" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="reveal min-w-0 flex-[1_1_420px] rounded-3xl bg-white p-6 text-ink shadow-xl">
            <div className="mb-5 flex items-end justify-between gap-3">
              <div>
                <p className="text-sm text-muted">Exemple · tracteur 180 ch, 700 h / an</p>
                <p className="text-4xl font-bold tabular-nums text-brand-dark">{eur(exampleTotal)} € <span className="text-base font-medium text-muted">HT / h</span></p>
              </div>
            </div>
            <div className="mb-5 flex h-4 overflow-hidden rounded-full">
              {example.map((e) => <div key={e.label} className={e.color} style={{ width: `${(e.value / exampleTotal) * 100}%` }} />)}
            </div>
            <ul className="flex flex-col gap-2.5 text-sm">
              {example.map((e) => (
                <li key={e.label} className="flex items-center gap-3">
                  <span className={`size-3 flex-none rounded-full ${e.color}`} />
                  <span className="flex-1">{e.label}</span>
                  <strong className="tabular-nums">{eur(e.value)} € / h</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* En trois étapes */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="mb-10 text-center text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">Prêt en trois étapes</h2>
        <ol className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
          {[
            ['Ajoutez vos machines', 'Choisissez le modèle dans la base : le plan d’entretien est repris automatiquement.'],
            ['Relevez les compteurs', 'De temps en temps, en dix secondes. Sillon calcule vos heures de travail.'],
            ['Suivez entretiens et coûts', 'Rappels avant chaque échéance, dépenses notées, coût de revient à jour.'],
          ].map(([title, text], i) => (
            <li key={title} className="reveal group flex gap-4 rounded-2xl border border-line bg-white p-6">
              <span className="flex size-11 flex-none items-center justify-center rounded-full bg-brand-soft text-lg font-bold text-brand-dark transition-colors duration-300 group-hover:bg-brand group-hover:text-white">{i + 1}</span>
              <div>
                <h3 className="mb-1 text-lg font-semibold">{title}</h3>
                <p className="text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Fiches techniques */}
      <section className="bg-ground">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="mb-2 font-semibold text-brand">Base technique</p>
              <h2 className="mb-3 text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">Les fiches techniques de vos machines</h2>
              <p className="text-muted">Caractéristiques, carnet d’entretien, pannes connues et tests à faire, avec les sources citées. Chaque fiche est relue avant publication.</p>
            </div>
            <Link href="/fiches" className={btn.primary}>Toutes les fiches</Link>
          </div>
          {sheets.length ? (
            <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
              {sheets.map((s) => {
                const figures = keyFigures(parseSheetContent(s.content), 2);
                return (
                  <Link key={s.id} href={`/fiches/${s.slug}`} transitionTypes={['nav-forward']} className="sheet-card group flex flex-col overflow-hidden rounded-2xl border border-line bg-white text-ink">
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

      <section id="tarifs" className="bg-ground">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="mb-3 text-center text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">Des tarifs clairs</h2>
          <p className="mb-11 text-center text-muted">Gratuit pour démarrer. Sans engagement.</p>
          <PricingCards />
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="mb-8 text-center text-[clamp(28px,3vw,36px)] font-bold tracking-tight">Questions fréquentes</h2>
        <div className="border-t border-line">
          {faq.map((item) => (
            <details key={item.q} className="border-b border-line py-5">
              <summary className="cursor-pointer text-lg font-semibold transition-colors hover:text-brand">{item.q}</summary>
              <p className="mt-3 text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="bg-brand text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-16">
          <div>
            <h2 className="mb-1.5 text-[clamp(26px,3vw,34px)] font-bold tracking-tight">Mettez votre parc matériel au propre</h2>
            <p className="text-[#d7e8d5]">Gratuit jusqu’à {FREE_MACHINE_LIMIT} machines, sans carte bancaire.</p>
          </div>
          <Link href="/inscription" className="btn-light inline-flex min-h-12 items-center rounded-[10px] bg-white px-7 py-3 font-semibold text-brand-dark">
            Créer mon compte
          </Link>
        </div>
      </section>
    </>
  );
}
