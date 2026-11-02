import Image from 'next/image';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckIcon, Logo, btn } from '@/components/ui';
import { PricingCards } from '@/components/pricing-cards';
import { FurrowBand } from '@/components/sheets/machine-art';
import { Icon, type IconName } from '@/components/sheets/icons';
import { FREE_MACHINE_LIMIT } from '@/lib/plans';
import heroPhoto from '../../../../public/photos/accueil-travail-du-sol.jpg';
import exploitantPhoto from '../../../../public/photos/exploitant-tracteur.jpg';
import cumaPhoto from '../../../../public/photos/cuma-chantier.jpg';
import etaPhoto from '../../../../public/photos/eta-moisson.jpg';
import costPhoto from '../../../../public/photos/cout-de-revient-pressage.jpg';
import captureDashboard from '../../../../public/captures/tableau-de-bord.webp';
import captureDue from '../../../../public/captures/echeances.webp';
import captureInvoice from '../../../../public/captures/facture.webp';

// Captures de l'application (compte de démonstration, données fictives).
const captures = [
  { img: captureDashboard, title: 'Tout le parc d’un coup d’œil', text: 'Ce qui est à faire cette semaine, les heures de l’année, les dépenses.' },
  { img: captureDue, title: 'Chaque échéance, au bon moment', text: 'Vidanges, filtres, graissage : au premier des deux termes, heures ou mois.' },
  { img: captureInvoice, title: 'La facture du garage en photo', text: 'Opérations, compteur et montant remplis tout seuls. Vous relisez, c’est noté.' },
];

const features: { icon: IconName; title: string; text: string; tag?: string }[] = [
  { icon: 'wrench', title: 'Carnet d’entretien automatique', text: 'Choisissez le modèle de votre machine : vidanges, filtres et graissages sont repris de sa fiche technique.' },
  { icon: 'clock', title: 'Rappels au bon moment', text: 'Chaque échéance tombe au premier terme atteint, heures moteur ou mois. Plus de vidange oubliée.' },
  { icon: 'camera', title: 'Facture du garage en photo', text: 'Photographiez la facture : entretiens, compteur et montant se remplissent tout seuls. Vous relisez, c’est enregistré.', tag: 'Nouveau' },
  { icon: 'team', title: 'Travaillez en équipe', text: 'Invitez un salarié, un associé ou votre mécanicien : chacun note ses heures et ses entretiens. Les dépenses restent à vous.', tag: 'Nouveau' },
  { icon: 'power', title: 'Coût de revient à l’heure', text: 'Amortissement, gazole, entretien, réparations : le vrai coût de chaque heure de travail, machine par machine.' },
  { icon: 'warning', title: 'Aide au diagnostic', text: 'Un voyant, un bruit, une perte de puissance ? Les causes possibles et quoi vérifier, du plus simple au plus poussé.' },
  { icon: 'book', title: 'Fiches techniques', text: 'Caractéristiques, plan d’entretien, pannes connues et pièces, avec les sources citées. Un modèle manque ? Demandez-le.' },
  { icon: 'can', title: 'Dépenses et carburant', text: 'Pleins, pneus, assurance, réparations : tout est rattaché à la machine, avec la consommation en L/h.' },
  { icon: 'print', title: 'Rapport pour la revente', text: 'Un historique d’entretien propre à remettre à l’acheteur : votre matériel se vend mieux.' },
];

const audiences = [
  { icon: 'tag' as IconName, title: 'Exploitants', text: 'Suivez vos tracteurs et outils sans paperasse, depuis le téléphone.', photo: exploitantPhoto, alt: 'Tracteur rouge en bordure de parcelle', position: 'object-[50%_60%]' },
  { icon: 'hitch' as IconName, title: 'CUMA', text: 'Coût horaire réel de chaque machine pour fixer des tarifs justes.', photo: cumaPhoto, alt: 'Chantier de récolte vu du ciel : tracteur, benne et moissonneuse', position: 'object-center' },
  { icon: 'gear' as IconName, title: 'Entrepreneurs de travaux', text: 'Marge par machine et entretien d’une flotte qui tourne beaucoup.', photo: etaPhoto, alt: 'Moissonneuse-batteuse en chantier dans la poussière', position: 'object-[50%_55%]' },
];

const faq = [
  { q: 'Faut-il être à l’aise avec l’informatique ?', a: 'Non. Relever un compteur ou noter une vidange prend dix secondes, avec de gros boutons pensés pour le téléphone.' },
  { q: 'Mon modèle de tracteur n’a pas de fiche technique ?', a: 'Vous pouvez quand même l’ajouter et créer votre propre plan d’entretien. La base de fiches s’enrichit chaque semaine.' },
  { q: 'Comment est calculé le coût de revient ?', a: 'Charges fixes (amortissement, frais financiers, assurance) divisées par vos heures annuelles, plus les charges variables (carburant, entretien, réparations) rapportées aux heures travaillées. Les heures viennent de vos relevés de compteur.' },
  { q: 'Mon salarié ou mon mécanicien peut-il l’utiliser ?', a: 'Oui, avec la formule Complet : invitez jusqu’à deux personnes. Elles notent heures et entretiens sur votre parc, sans voir vos dépenses ni pouvoir supprimer une machine.' },
  { q: 'Comment marche la facture en photo ?', a: 'Sur la fiche d’une machine, prenez la facture du garage en photo. L’intelligence artificielle lit la date, le compteur, les opérations et le montant ; vous vérifiez et corrigez avant d’enregistrer. La photo n’est pas conservée.' },
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

export const metadata: Metadata = {
  title: 'Gestion de parc matériel agricole : carnet d’entretien, rappels, coût de revient',
  description: 'Le carnet de santé de vos tracteurs et outils : entretiens, rappels aux heures ou aux mois, dépenses, coût de revient à l’heure, aide au diagnostic. Gratuit pour démarrer.',
  alternates: { canonical: '/gestion-de-parc' },
};

export default async function ParcPage(props: PageProps<'/gestion-de-parc'>) {
  const { demo } = await props.searchParams;

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
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- navigation complète : la session de démo se pose par cookie */}
              <a href="/demo" className={btn.secondary}>Voir la démo, sans inscription</a>
            </div>
            {demo === 'indisponible' || demo === 'occupee' ? (
              <p role="alert" className="mb-5 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
                La démo est momentanément indisponible. Réessayez dans quelques minutes, ou créez directement votre compte : c’est gratuit.
              </p>
            ) : null}
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-muted">
              {[`Gratuit jusqu’à ${FREE_MACHINE_LIMIT} machines`, 'Sans engagement', 'Vos données vous appartiennent'].map((t) => (
                <li key={t} className="flex items-center gap-2"><CheckIcon className="text-brand" />{t}</li>
              ))}
            </ul>
          </div>

          <div className="relative min-w-0 flex-[1_1_480px]">
            <div className="hero-photo relative h-[440px] overflow-hidden rounded-3xl border border-line shadow-[0_30px_60px_-40px_rgba(0,0,0,0.60)]">
              <Image
                src={heroPhoto}
                alt="Tracteur au travail du sol au coucher du soleil"
                fill
                priority
                placeholder="blur"
                sizes="(min-width: 1024px) 560px, 100vw"
                className="object-cover object-[42%_62%]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" aria-hidden="true" />
            </div>
            <div className="figure absolute -left-2 top-8 w-64 max-w-[78%] rounded-2xl bg-surface p-4 shadow-[0_16px_36px_rgba(0,0,0,0.36)] sm:-left-6" style={{ animationDelay: '350ms' }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Prochain entretien</p>
              <p className="mb-2 font-semibold">Vidange moteur</p>
              <div className="mb-1.5 h-2 overflow-hidden rounded-full bg-line"><div className="hour-fill h-full w-[82%] rounded-full bg-wheat" /></div>
              <p className="text-sm font-semibold text-warn">dans 42 h ou 3 semaines</p>
            </div>
            <div className="figure absolute -right-2 bottom-8 w-60 max-w-[75%] rounded-2xl bg-admin p-4 text-white shadow-[0_16px_36px_rgba(0,0,0,0.60)] sm:-right-6" style={{ animationDelay: '550ms' }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-panel-muted">Coût de revient</p>
              <p className="text-3xl font-bold tabular-nums">{eur(exampleTotal)} €<span className="text-base font-medium text-panel-muted"> / h</span></p>
              <p className="text-sm text-panel-muted">Tracteur 180 ch · exemple</p>
            </div>
          </div>
        </div>
        <FurrowBand className="block h-4 w-full text-brand-soft" />
      </section>

      {/* Pour qui */}
      <section className="bg-ground">
        <div className="mx-auto grid max-w-6xl gap-5 px-6 py-14 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
          {audiences.map((a) => (
            <article key={a.title} className="lift-card reveal group overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="relative h-44 overflow-hidden bg-photo">
                <Image
                  src={a.photo}
                  alt={a.alt}
                  fill
                  placeholder="blur"
                  sizes="(min-width: 1024px) 370px, (min-width: 640px) 50vw, 100vw"
                  className={`object-cover transition-transform duration-700 group-hover:scale-105 ${a.position}`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" aria-hidden="true" />
                <span className="absolute bottom-3 left-3 flex size-10 items-center justify-center rounded-xl bg-brand text-on-brand shadow-lg"><Icon name={a.icon} size={20} /></span>
              </div>
              <div className="p-5">
                <h2 className="mb-1 text-lg font-semibold">{a.title}</h2>
                <p className="text-[15px] text-muted">{a.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* L'application, en vrai */}
      <section id="apercu" className="scroll-mt-20 border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="mb-3 text-center text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">L’application, en vrai</h2>
          <p className="mx-auto mb-12 max-w-xl text-center text-muted">Pensée pour le téléphone, avec de gros boutons : relever un compteur ou noter une vidange prend dix secondes.</p>
          <div className="-mx-6 flex snap-x snap-mandatory gap-6 overflow-x-auto px-6 pb-4 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0">
            {captures.map((c) => (
              <figure key={c.title} className="reveal flex w-[260px] flex-none snap-center flex-col items-center gap-5 md:w-auto">
                <div className="w-full max-w-[290px] rounded-[38px] border border-line bg-[#0b0a09] p-2.5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]">
                  <Image src={c.img} alt={`Capture de l’application : ${c.title.toLowerCase()}`} sizes="(min-width: 768px) 290px, 260px" placeholder="blur" className="h-auto w-full rounded-[30px]" />
                </div>
                <figcaption className="max-w-[290px] text-center">
                  <p className="font-semibold">{c.title}</p>
                  <p className="text-sm text-muted">{c.text}</p>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="mt-10 flex flex-col items-center gap-2 text-center">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- navigation complète : la session de démo se pose par cookie */}
            <a href="/demo" className={btn.primary}>Ouvrir le parc de démonstration</a>
            <p className="text-sm text-muted">Un vrai parc d’exemple à parcourir, sans inscription ni carte bancaire.</p>
          </div>
        </div>
      </section>

      {/* Fonctionnalités */}
      <section id="fonctions" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
        <h2 className="mb-3 text-center text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">Tout votre matériel, bien suivi</h2>
        <p className="mx-auto mb-12 max-w-xl text-center text-muted">Moins de pannes, des entretiens faits à temps, et enfin le vrai coût de chaque machine.</p>
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
          {features.map((f) => (
            <article key={f.title} className="lift-card reveal group rounded-2xl border border-line bg-surface p-6">
              <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-brand-tint text-brand transition-colors duration-300 group-hover:bg-brand group-hover:text-on-brand">
                <Icon name={f.icon} size={24} />
              </span>
              <h3 className="mb-2 flex flex-wrap items-center gap-2 text-lg font-semibold">
                {f.title}
                {f.tag ? <span className="rounded-full bg-brand-tint px-2 py-0.5 text-xs font-bold text-brand-dark">{f.tag}</span> : null}
              </h3>
              <p className="text-[15px] text-muted">{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Coût de revient */}
      <section className="relative isolate overflow-hidden bg-admin text-white">
        <Image src={costPhoto} alt="" fill sizes="100vw" placeholder="blur" className="-z-20 object-cover object-[50%_70%] opacity-40" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-admin via-admin/85 to-admin/30" aria-hidden="true" />
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-14 px-6 py-24">
          <div className="min-w-0 flex-[1_1_420px]">
            <p className="mb-2 font-semibold text-wheat">Coût de revient</p>
            <h2 className="mb-4 text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">Combien vous coûte vraiment une heure de tracteur ?</h2>
            <p className="mb-6 text-panel-muted">
              Tracteurs & Co additionne l’amortissement, les frais financiers, l’assurance, le gazole, l’entretien et les réparations, puis les rapporte à vos heures réelles de travail, d’après vos relevés de compteur.
            </p>
            <ul className="flex flex-col gap-3 text-panel">
              {['Comparez vos machines entre elles', 'Fixez un tarif juste en CUMA ou en prestation', 'Voyez votre marge si vous facturez à l’heure'].map((t) => (
                <li key={t} className="flex gap-2.5"><CheckIcon className="mt-1 flex-none text-success" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="reveal min-w-0 flex-[1_1_420px] rounded-3xl bg-surface p-6 text-ink shadow-xl">
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
        <ol className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
          {[
            ['Ajoutez vos machines', 'Choisissez le modèle dans la base : le plan d’entretien est repris automatiquement.'],
            ['Relevez les compteurs', 'De temps en temps, en dix secondes. Tracteurs & Co calcule vos heures de travail.'],
            ['Suivez entretiens et coûts', 'Rappels avant chaque échéance, dépenses notées, coût de revient à jour.'],
          ].map(([title, text], i) => (
            <li key={title} className="reveal group flex gap-4 rounded-2xl border border-line bg-surface p-6">
              <span className="flex size-11 flex-none items-center justify-center rounded-full bg-brand-soft text-lg font-bold text-brand-dark transition-colors duration-300 group-hover:bg-brand group-hover:text-on-brand">{i + 1}</span>
              <div>
                <h3 className="mb-1 text-lg font-semibold">{title}</h3>
                <p className="text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

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

      <section className="relative overflow-hidden bg-admin text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-16">
          <div className="flex items-center gap-6">
            <Logo variant="embleme" tone="dark" height={96} className="hidden flex-none sm:inline-flex" />
            <div>
              <h2 className="mb-1.5 text-[clamp(26px,3vw,34px)] font-bold tracking-tight">Mettez votre parc matériel au propre</h2>
              <p className="text-panel-muted">Gratuit jusqu’à {FREE_MACHINE_LIMIT} machines, sans carte bancaire.</p>
            </div>
          </div>
          <Link href="/inscription" className={btn.primary}>
            Créer mon compte
          </Link>
        </div>
      </section>
    </>
  );
}
