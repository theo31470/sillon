'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Celebration } from '@/components/celebrate';
import { btn } from '@/components/ui';

/** Fête de fin de commande : le tracteur arrive avec la remorque et le colis. */
export function OrderCelebration({
  orderId,
  reference,
  firstName,
  items,
  total,
  delay,
}: {
  orderId: string;
  reference: string;
  firstName: string;
  items: { name: string; detail: string; image: string | null; quantity: number }[];
  total: string;
  delay: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const close = useCallback(() => {
    setOpen(false);
    router.replace(`/app/boutique/merci?commande=${orderId}`, { scroll: false });
  }, [router, orderId]);
  if (!open) return null;

  return (
    <Celebration
      withParcel
      title={`Merci${firstName ? ` ${firstName}` : ''}, c’est parti !`}
      subtitle={`Commande ${reference} validée. Vos articles partent à l’atelier pour être imprimés rien que pour vous.`}
      onClose={close}
      actions={
        <>
          <button type="button" onClick={close} className={`${btn.primary} flex-1`}>
            Suivre ma commande
          </button>
          <Link href="/app/boutique" className={`${btn.secondary} flex-1`}>
            Retour à la boutique
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {items.map((i, n) => (
            <li key={n} className="celebrate-rise relative size-20 flex-none overflow-hidden rounded-xl bg-[#f4f2ee]" style={{ animationDelay: `${1250 + n * 120}ms` }} title={`${i.quantity} × ${i.name}${i.detail ? ` (${i.detail})` : ''}`}>
              {i.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- maquettes servies par Printful
                <img src={i.image} alt={i.name} className="size-full object-contain p-1" />
              ) : null}
              {i.quantity > 1 ? <span className="absolute bottom-1 right-1 rounded-full bg-brand px-1.5 text-xs font-bold text-on-brand">×{i.quantity}</span> : null}
            </li>
          ))}
        </ul>
        <p className="flex items-baseline justify-between gap-3 rounded-xl bg-ground px-4 py-3 text-sm">
          <span className="text-muted">{delay ? `Livraison en ${delay} après l’expédition` : 'Livraison en France'}</span>
          <span className="text-base font-bold tabular-nums">{total}</span>
        </p>
        <p className="text-sm text-muted">Un e-mail de confirmation vient de partir. Le numéro de suivi suivra dès l’envoi du colis.</p>
      </div>
    </Celebration>
  );
}
