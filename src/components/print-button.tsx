'use client';

import { btn } from '@/components/ui';

export function PrintButton({ label = 'Imprimer / enregistrer en PDF' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={btn.primary}>
      {label}
    </button>
  );
}
