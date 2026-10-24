import Link from 'next/link';
import { CheckIcon, PhotoSlot, btn } from '@/components/ui';
import { PricingCards } from '@/components/pricing-cards';
import { LatestPosts } from '@/components/latest-posts';

const features = [
  { title: 'Vos parcelles sur une carte', text: 'Ajoutez vos champs avec leur culture et leur surface. Tout est visible en un coup d’œil.', photo: 'Photo : vue aérienne de parcelles' },
  { title: 'Un registre toujours à jour', text: 'Notez semis, traitements et récoltes en quelques secondes. Le registre se remplit tout seul.', photo: 'Photo : pulvérisateur dans une vigne' },
  { title: 'La météo de vos champs', text: 'Prévisions locales, alertes gel et les bons moments pour traiter.', photo: 'Photo : ciel nuageux au-dessus d’un champ' },
  { title: 'Votre matériel bien suivi', text: 'Fiches techniques complètes et rappels d’entretien selon les heures moteur.', photo: 'Photo : tracteur dans un hangar' },
];

const faq = [
  { q: 'Faut-il être à l’aise avec l’informatique ?', a: 'Non. L’application est pensée pour être utilisée au champ, avec de gros boutons et peu de saisie.' },
  { q: 'Mes données sont-elles à moi ?', a: 'Oui. Vous pouvez les exporter ou demander leur suppression à tout moment.' },
  { q: 'Le registre est-il accepté lors des contrôles ?', a: '[Réponse à valider avec un conseiller réglementaire avant la mise en ligne.]' },
  { q: 'Puis-je arrêter quand je veux ?', a: 'Oui, l’abonnement est sans engagement et se résilie en un clic depuis votre espace.' },
];

export default function HomePage() {
  return (
    <>
      <section className="mx-auto flex max-w-6xl flex-wrap items-center gap-14 px-6 pb-20 pt-16">
        <div className="min-w-0 flex-[1_1_440px]">
          <h1 className="mb-5 text-[clamp(38px,4.8vw,56px)] font-bold leading-[1.1] tracking-tight">
            Gérez votre exploitation simplement, depuis votre téléphone.
          </h1>
          <p className="mb-8 max-w-xl text-xl text-muted">
            Vos parcelles, vos interventions, la météo et l’entretien de votre matériel, au même endroit. Sans formation, sans paperasse.
          </p>
          <div className="mb-6 flex flex-wrap gap-3">
            <Link href="/inscription" className={btn.primary}>Essayer gratuitement</Link>
            <Link href="#fonctions" className={btn.secondary}>Voir comment ça marche</Link>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-muted">
            {['Gratuit pour démarrer', 'Sans engagement', 'Vos données vous appartiennent'].map((t) => (
              <li key={t} className="flex items-center gap-2"><CheckIcon className="text-brand" />{t}</li>
            ))}
          </ul>
        </div>
        <div className="relative min-w-0 flex-[1_1_480px]">
          <PhotoSlot label="Photo : un agriculteur dans son champ, téléphone en main, lumière naturelle" className="h-[460px]" />
          <div className="figure absolute bottom-8 left-0 w-64 max-w-[80%] rounded-xl bg-white p-4 shadow-[0_12px_32px_rgba(29,36,32,0.16)] sm:-left-5" style={{ animationDelay: '400ms' }}>
            <p className="text-sm text-muted">Intervention enregistrée</p>
            <p className="mb-2 font-semibold">Semis de blé · Les Grès</p>
            <p className="flex items-center gap-1.5 text-sm text-brand"><CheckIcon />Ajoutée au registre</p>
          </div>
        </div>
      </section>

      <section id="fonctions" className="bg-ground">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="mb-3 text-center text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">Tout ce dont vous avez besoin, rien de plus</h2>
          <p className="mx-auto mb-12 max-w-xl text-center text-muted">Quatre outils simples qui vous font gagner du temps chaque semaine.</p>
          <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
            {features.map((f) => (
              <article key={f.title} className="lift-card reveal group overflow-hidden rounded-2xl border border-line bg-white">
                <div className="overflow-hidden"><PhotoSlot label={f.photo} className="h-44 rounded-none group-hover:scale-105" /></div>
                <div className="p-6">
                  <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
                  <p className="text-[15px] text-muted">{f.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-6xl flex-wrap items-center gap-14 px-6 py-20">
        <PhotoSlot label="Capture d’écran : l’application sur un téléphone, écran « Noter une intervention »" className="h-[420px] min-w-0 flex-[1_1_460px]" />
        <div className="min-w-0 flex-[1_1_420px]">
          <h2 className="mb-8 text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">Prêt en trois étapes</h2>
          <ol className="flex flex-col gap-6">
            {[
              ['Ajoutez vos parcelles', 'Nom, culture et surface : deux minutes suffisent.'],
              ['Notez depuis le champ', 'Parcelle, produit, dose : trois champs à remplir, pas plus.'],
              ['Imprimez votre registre', 'Un document prêt pour les contrôles, quand vous voulez.'],
            ].map(([title, text], i) => (
              <li key={title} className="reveal group flex gap-4">
                <span className="flex size-10 flex-none items-center justify-center rounded-full bg-brand-soft font-bold text-brand-dark transition-colors duration-300 group-hover:bg-brand group-hover:text-white">{i + 1}</span>
                <div>
                  <h3 className="mb-1 text-lg font-semibold">{title}</h3>
                  <p className="text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-ground">
        <div className="mx-auto flex max-w-6xl flex-wrap-reverse items-center gap-14 px-6 py-20">
          <div className="min-w-0 flex-[1_1_420px]">
            <p className="mb-2 font-semibold text-brand">Fiches techniques</p>
            <h2 className="mb-4 text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">Toutes les infos sur votre matériel</h2>
            <p className="mb-6 text-muted">Pour chaque machine : caractéristiques, plan d’entretien, pannes fréquentes et références de pièces. Chaque fiche est relue avant publication.</p>
            <ul className="mb-7 flex flex-col gap-3">
              {['Tracteurs, motoculteurs, outils et pulvérisateurs', 'Aide au diagnostic quand une machine tombe en panne', 'Rappel automatique quand l’entretien approche'].map((t) => (
                <li key={t} className="flex gap-2.5"><CheckIcon className="mt-1 flex-none text-brand" />{t}</li>
              ))}
            </ul>
            <Link href="/fiches" className={btn.primary}>Parcourir les fiches</Link>
          </div>
          <PhotoSlot label="Photo : mécanicien qui fait l’entretien d’un tracteur, capot ouvert" className="h-[420px] min-w-0 flex-[1_1_460px]" />
        </div>
      </section>

      <LatestPosts />

      <section id="tarifs" className="bg-ground">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="mb-3 text-center text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">Des tarifs clairs</h2>
          <p className="mb-11 text-center text-muted">Sans engagement. Vous arrêtez quand vous voulez.</p>
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
            <h2 className="mb-1.5 text-[clamp(26px,3vw,34px)] font-bold tracking-tight">Essayez Sillon sur votre exploitation</h2>
            <p className="text-[#d7e8d5]">Gratuit, sans carte bancaire.</p>
          </div>
          <Link href="/inscription" className="btn-light inline-flex min-h-12 items-center rounded-[10px] bg-white px-7 py-3 font-semibold text-brand-dark">
            Créer mon compte
          </Link>
        </div>
      </section>
    </>
  );
}
