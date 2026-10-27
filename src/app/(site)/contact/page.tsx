import type { Metadata } from 'next';
import { getProfile } from '@/lib/auth';
import { SITE } from '@/lib/site';
import { CONTACT_TOPICS } from '@/lib/contact';
import { ContactForm } from './contact-form';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Une question sur Tracteurs & Co, votre abonnement ou une fiche technique ? Écrivez-nous.',
};

export default async function ContactPage(props: PageProps<'/contact'>) {
  const { sujet } = await props.searchParams;
  const profile = await getProfile();
  const topic = typeof sujet === 'string' && sujet in CONTACT_TOPICS ? sujet : 'question';

  return (
    <section className="bg-ground">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-16 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="flex flex-col gap-4">
          <h1 className="text-[clamp(32px,4vw,44px)] font-bold tracking-tight">Contact</h1>
          <p className="text-muted">Une question sur le service, votre abonnement, une erreur dans une fiche technique, un projet pour votre CUMA ? Écrivez-nous : nous répondons en général sous 2 jours ouvrés.</p>
          <div className="rounded-2xl border border-line bg-surface p-5 text-sm">
            <p className="font-semibold">Par e-mail</p>
            <a href={`mailto:${SITE.contactEmail}`} className="text-brand">{SITE.contactEmail}</a>
          </div>
        </div>
        <ContactForm defaults={{ name: profile?.full_name ?? '', email: profile?.email ?? '', farm_name: profile?.farm_name ?? '', topic }} />
      </div>
    </section>
  );
}
