'use client';

import { useState } from 'react';
import { btn } from '@/components/ui';

/** Lien de parrainage : copie en un clic, ou partage (WhatsApp, SMS, e-mail, partage du téléphone). */
export function ReferralShare({ link, code }: { link: string; code: string }) {
  const [copied, setCopied] = useState<'lien' | 'code' | null>(null);
  const message = `Je suis l’entretien de mes tracteurs sur Tracteurs & Co (carnet, rappels, fiches techniques). Avec mon lien, tu as un mois offert en plus de l’essai : ${link}`;

  async function copy(text: string, what: 'lien' | 'code') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* presse-papiers refusé : le lien reste sélectionnable */
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'Tracteurs & Co', text: message });
    } catch {
      /* partage annulé */
    }
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input readOnly value={link} aria-label="Votre lien de parrainage" onFocus={(e) => e.currentTarget.select()} className="min-h-12 min-w-0 flex-1 rounded-[10px] border border-field bg-ground px-3.5 text-[15px]" />
        <button type="button" onClick={() => copy(link, 'lien')} className={`${btn.secondary} shrink-0`}>
          {copied === 'lien' ? 'Copié ✓' : 'Copier'}
        </button>
      </div>
      <p className="text-sm text-muted">
        Ou donnez simplement votre code{' '}
        <button type="button" onClick={() => copy(code, 'code')} className="rounded-md bg-ground px-2 py-0.5 font-mono font-bold tracking-wider text-ink hover:text-brand-dark" title="Copier le code">
          {code}
        </button>
        {copied === 'code' ? <span className="ml-1.5 text-success">copié</span> : null}, à saisir au moment de s’abonner.
      </p>
      <div className="flex flex-wrap gap-2">
        {canShare ? (
          <button type="button" onClick={share} className={btn.small}>
            Partager…
          </button>
        ) : null}
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className={btn.small}>
          WhatsApp
        </a>
        <a href={`sms:?&body=${encodeURIComponent(message)}`} className={btn.small}>
          SMS
        </a>
        <a href={`mailto:?subject=${encodeURIComponent('Un mois offert sur Tracteurs & Co')}&body=${encodeURIComponent(message)}`} className={btn.small}>
          E-mail
        </a>
      </div>
    </div>
  );
}
