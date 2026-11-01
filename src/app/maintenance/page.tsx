import type { Metadata } from 'next';
import Link from 'next/link';
import { getMaintenance } from '@/lib/maintenance-server';
import { getProfile } from '@/lib/auth';
import { SITE } from '@/lib/site';
import { Logo } from '@/components/ui';
import { MaintenanceScene, ReopenWatcher } from './maintenance-view';

export const metadata: Metadata = { title: 'Maintenance en cours', robots: { index: false } };
export const dynamic = 'force-dynamic';

const DEFAULT_MESSAGE = 'Le site fait sa révision et revient très vite. Vos données sont en sécurité : rien n’est perdu, rien n’est modifié.';

function returnLabel(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (d.getTime() < Date.now() - 5 * 60_000) return null;
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(d);
  const sameDay = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }) === new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const time = fmt({ hour: 'numeric', minute: '2-digit' }).replace(':', ' h ');
  return sameDay ? `vers ${time}` : `le ${fmt({ weekday: 'long', day: 'numeric', month: 'long' })} vers ${time}`;
}

export default async function MaintenancePage(props: PageProps<'/maintenance'>) {
  const { apercu } = await props.searchParams;
  const state = await getMaintenance();
  let isAdmin = false;
  try {
    isAdmin = (await getProfile())?.role === 'admin';
  } catch {
    /* visiteur */
  }
  const preview = isAdmin && apercu === '1';
  // Site déjà rouvert (le proxy garde l'état quelques secondes) : on annonce le retour et on recharge.
  const reopened = !state.active && !preview;
  const back = returnLabel(state.until);

  return (
    <main className="maintenance relative isolate flex min-h-dvh flex-1 overflow-hidden bg-[#1a1420] text-white">
      {/* Fond de secours (avant le chargement de la 3D, ou sans WebGL) */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_20%_100%,#5a3a2a_0%,transparent_60%),linear-gradient(180deg,#10162f_0%,#4b3a63_45%,#f09a62_78%,#3a2418_100%)]" />
      <MaintenanceScene />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(12,10,14,0.82)_0%,rgba(12,10,14,0.45)_38%,transparent_62%)] max-md:bg-[linear-gradient(0deg,rgba(12,10,14,0.92)_0%,rgba(12,10,14,0.55)_45%,transparent_70%)]" />
      <ReopenWatcher preview={preview} reopened={reopened} />

      <div className="relative z-10 flex w-full flex-col justify-between gap-10 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.75rem,env(safe-area-inset-top))] sm:px-10 lg:px-16">
        <header className="flex items-center justify-between gap-4">
          <Logo tone="dark" height={30} />
          {preview ? <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">Aperçu administrateur{state.active ? '' : ' · site ouvert'}</span> : null}
        </header>

        <section className="max-w-xl max-md:mt-auto">
          <p className="mb-4 inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-black/30 px-3.5 py-1.5 text-sm font-semibold text-[#ffc27a] backdrop-blur">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#ffa53a] opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2.5 rounded-full bg-[#ffa53a]" />
            </span>
            {reopened ? 'Révision terminée' : 'Maintenance en cours'}
          </p>
          <h1 className="font-display text-[clamp(38px,6vw,68px)] font-extrabold leading-[1.02] tracking-tight [text-wrap:balance]">
            {reopened ? (
              <>
                C’est reparti, <span className="text-[#f0a36b]">moteur !</span>
              </>
            ) : (
              <>
                On bichonne <span className="text-[#f0a36b]">la machine.</span>
              </>
            )}
          </h1>
          <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-white/80 sm:text-lg">
            {reopened ? 'Le site est de nouveau ouvert. Vous allez être redirigé dans un instant.' : state.message || DEFAULT_MESSAGE}
          </p>

          <div className="mt-7 max-w-md">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold text-white/90">Révision en cours</span>
              {back ? <span className="text-white/70">Retour prévu {back}</span> : <span className="text-white/60">Retour très bientôt</span>}
            </div>
            <div className="maintenance-bar mt-2.5 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Révision en cours" aria-valuetext="En cours">
              <span className="block h-full w-full rounded-full" />
            </div>
          </div>

          <p className="mt-6 text-sm text-white/60">
            Cette page se recharge toute seule dès que le site est rouvert. Une urgence ?{' '}
            <a href={`mailto:${SITE.contactEmail}`} className="font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
              {SITE.contactEmail}
            </a>
          </p>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/40">
          <span className="max-md:hidden">
            © {new Date().getFullYear()} {SITE.name} · Machinisme agricole
          </span>
          <Link href="/connexion?suite=/admin/maintenance" prefetch={false} className="underline decoration-white/20 underline-offset-4 hover:text-white/80">
            Connexion administrateur
          </Link>
        </footer>
      </div>
    </main>
  );
}
