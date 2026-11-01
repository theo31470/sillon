'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Celebration } from '@/components/celebrate';
import { MemberCard } from '@/components/member-card';
import { btn } from '@/components/ui';

const UNLOCKED = [
  'Parc matériel illimité',
  'Factures du garage lues en photo',
  'Coût de revient à l’heure',
  'Aide au diagnostic des pannes',
  'Partage du parc avec votre équipe',
  '−10 % sur la boutique',
];

/** Accueil dans la formule Complet, juste après l'activation. */
export function SubscriptionWelcome({
  farm,
  holder,
  since,
  number,
  trialEnd,
  shopOpen,
}: {
  farm: string;
  holder: string;
  since: string;
  number: string;
  trialEnd: string | null;
  shopOpen: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const close = useCallback(() => {
    setOpen(false);
    router.replace('/app/abonnement', { scroll: false });
  }, [router]);
  if (!open) return null;
  const first = holder.trim().split(/\s+/)[0];

  return (
    <Celebration
      title={`Bienvenue dans le Complet${first ? `, ${first}` : ''} !`}
      subtitle={trialEnd ? `Votre essai gratuit commence : rien n’est débité avant le ${trialEnd}.` : 'Votre formule est active. Voici votre carte de membre.'}
      onClose={close}
      actions={
        <>
          <Link href="/app/materiel" className={`${btn.primary} flex-1`}>
            Ouvrir mon parc
          </Link>
          <button type="button" onClick={close} className={`${btn.secondary} flex-1`}>
            Voir mon abonnement
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <MemberCard farm={farm} holder={holder} since={since} number={number} flip />
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          {UNLOCKED.filter((u) => shopOpen || !u.includes('boutique')).map((u, i) => (
            <li key={u} className="celebrate-rise flex items-start gap-1.5" style={{ animationDelay: `${1500 + i * 90}ms` }}>
              <svg className="mt-0.5 flex-none text-success" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              {u}
            </li>
          ))}
        </ul>
      </div>
    </Celebration>
  );
}
