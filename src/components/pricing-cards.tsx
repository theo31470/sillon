'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ANNUAL_DISCOUNT, COMPLET_PRICES, PLANS, type BillingPeriod } from '@/lib/plans';
import { SITE } from '@/lib/site';
import { btn } from '@/components/ui';

export function PricingCards() {
  const [period, setPeriod] = useState<BillingPeriod>('mensuel');
  const order = ['free', 'complet', 'groupement'] as const;
  const price = COMPLET_PRICES[period];

  return (
    <div className="flex flex-col items-center gap-8">
      <div role="radiogroup" aria-label="Période de facturation" className="inline-flex rounded-full border border-line bg-surface p-1 text-sm font-semibold">
        {(['mensuel', 'annuel'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={period === p}
            onClick={() => setPeriod(p)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 transition-colors ${period === p ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'}`}
          >
            {p === 'mensuel' ? 'Mensuel' : 'Annuel'}
            {p === 'annuel' ? (
              <span className={`rounded-full px-2 py-0.5 text-xs ${period === p ? 'bg-on-brand/15' : 'bg-success-soft text-success'}`}>−{ANNUAL_DISCOUNT} %</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="grid w-full gap-6 [grid-template-columns:repeat(auto-fit,minmax(270px,1fr))]">
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
              <div>
                <p className="text-4xl font-bold leading-none">
                  {featured ? price.label : plan.priceLabel}{' '}
                  <span className="text-base font-normal text-muted">{featured ? price.period : plan.period}</span>
                </p>
                {featured ? (
                  <p className="mt-2 text-sm text-muted">
                    {period === 'annuel'
                      ? `Soit ${COMPLET_PRICES.annuel.perMonth} par mois · ${COMPLET_PRICES.annuel.saving}`
                      : `Ou ${COMPLET_PRICES.annuel.label} par an (−${ANNUAL_DISCOUNT} %)`}
                  </p>
                ) : null}
              </div>
              <ul className="flex flex-1 list-disc flex-col gap-2 pl-5 text-muted">
                {plan.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              {key === 'groupement' ? (
                <Link href="/contact?sujet=partenariat" className={btn.secondary}>Nous contacter</Link>
              ) : (
                <Link href={featured ? `/inscription?formule=complet&periode=${period}` : '/inscription'} className={featured ? btn.primary : btn.secondary}>
                  {featured ? 'Essayer 30 jours gratuits' : 'Commencer'}
                </Link>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-center text-xs text-muted">Prix TTC · {SITE.vatMention} · Sans engagement, résiliable à tout moment.</p>
    </div>
  );
}
