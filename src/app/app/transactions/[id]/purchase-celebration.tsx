'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Celebration } from '@/components/celebrate';
import { btn } from '@/components/ui';

/** Fête d'achat sur la bourse : le tracteur arrive, la remorque chargée si le matériel voyage par colis. */
export function PurchaseCelebration({ orderId, firstName, title, photo, mode, seller }: { orderId: string; firstName: string; title: string; photo: string | null; mode: 'envoi' | 'main_propre'; seller: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const close = useCallback(() => {
    setOpen(false);
    router.replace(`/app/transactions/${orderId}`, { scroll: false });
  }, [router, orderId]);
  if (!open) return null;

  return (
    <Celebration
      withParcel={mode === 'envoi'}
      title={`Bravo${firstName ? ` ${firstName}` : ''}, c’est à vous !`}
      subtitle={
        mode === 'envoi'
          ? `${seller} est prévenu et prépare l’envoi. Votre argent reste de côté jusqu’à la réception.`
          : `${seller} est prévenu. Convenez du rendez-vous par la messagerie, puis donnez-lui votre code à la remise.`
      }
      onClose={close}
      actions={
        <button type="button" onClick={close} className={`${btn.primary} flex-1`}>
          {mode === 'envoi' ? 'Suivre mon achat' : 'Voir mon code de remise'}
        </button>
      }
    >
      <div className="flex items-center gap-3 rounded-2xl bg-ground p-3">
        <span className="size-16 flex-none overflow-hidden rounded-xl bg-surface">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- photo de l'annonce
            <img src={photo} alt="" className="size-full object-cover" />
          ) : null}
        </span>
        <span className="line-clamp-2 font-semibold">{title}</span>
      </div>
    </Celebration>
  );
}
