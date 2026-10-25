import Link from 'next/link';
import { PLANS } from '@/lib/plans';
import { btn } from '@/components/ui';

export function PricingCards() {
  const order = ['free', 'complet', 'groupement'] as const;
  return (
    <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(270px,1fr))]">
      {order.map((key) => {
        const plan = PLANS[key];
        const featured = key === 'complet';
        return (
          <div
            key={key}
            className={`lift-card reveal flex flex-col gap-5 rounded-2xl bg-surface p-8 ${featured ? 'border-2 border-brand' : 'border border-line'}`}
          >
            <h3 className="flex items-center justify-between text-xl font-semibold">
              {plan.name}
              {featured ? <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs text-brand-dark">Le plus choisi</span> : null}
            </h3>
            <p className="text-4xl font-bold leading-none">
              {plan.priceLabel} <span className="text-base font-normal text-muted">{plan.period}</span>
            </p>
            <ul className="flex flex-1 list-disc flex-col gap-2 pl-5 text-muted">
              {plan.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
            {key === 'groupement' ? (
              <a href="mailto:contact@[votre-domaine].fr" className={btn.secondary}>Nous contacter</a>
            ) : (
              <Link href={featured ? '/inscription?formule=complet' : '/inscription'} className={featured ? btn.primary : btn.secondary}>
                {featured ? 'Essayer 30 jours gratuits' : 'Commencer'}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
