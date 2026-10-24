import type { PhotoCredit } from '@/lib/types';

const safe = (url: string | null | undefined) => (url && /^https?:\/\//.test(url) ? url : null);

/**
 * Mention obligatoire d'une photo : auteur, licence, source.
 * `compact` : version courte sans liens (pour les cartes, déjà cliquables).
 */
export function PhotoCreditLine({ credit, compact = false }: { credit: PhotoCredit | null | undefined; compact?: boolean }) {
  if (!credit) return null;
  if (compact) {
    return (
      <span className="pointer-events-none absolute bottom-1.5 right-2 max-w-[85%] truncate rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
        Photo : {credit.author} · {credit.license}
      </span>
    );
  }
  const link = 'underline decoration-white/40 underline-offset-2 transition-colors hover:decoration-white';
  const sourceUrl = safe(credit.source_url);
  const licenseUrl = safe(credit.license_url);
  return (
    <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-4 pb-2.5 pt-8 text-xs text-white/90">
      Photo : {credit.author}
      {' · '}
      {licenseUrl ? <a href={licenseUrl} target="_blank" rel="noopener noreferrer license" className={link}>{credit.license}</a> : credit.license}
      {sourceUrl ? (
        <>
          {' · '}
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={link}>
            {credit.source === 'commons' ? 'via Wikimedia Commons' : 'source'}
          </a>
        </>
      ) : null}
    </p>
  );
}
