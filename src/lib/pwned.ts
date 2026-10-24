import 'server-only';
import { createHash } from 'node:crypto';

/**
 * Vérifie si un mot de passe figure dans des fuites de données connues,
 * via le service gratuit « Pwned Passwords » (haveibeenpwned.com).
 *
 * Le mot de passe ne quitte jamais le serveur : on calcule son empreinte SHA-1
 * et on n'envoie que ses 5 premiers caractères (méthode « k-anonymat »). Le
 * service renvoie toutes les empreintes qui commencent ainsi, et la comparaison
 * se fait ici. L'en-tête Add-Padding masque même la taille de la réponse.
 *
 * Renvoie le nombre de fuites (0 = jamais vu), ou null si le service ne répond
 * pas : dans ce cas on laisse passer, pour ne pas bloquer les inscriptions.
 */
export async function pwnedCount(password: string, fetcher: typeof fetch = fetch): Promise<number | null> {
  const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const res = await fetcher(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'Sillon (verification des mots de passe)' },
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    for (const line of (await res.text()).split('\n')) {
      const [candidate, count] = line.trim().split(':');
      if (candidate === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return null;
  }
}

/** Message d'erreur à afficher, ou null si le mot de passe n'a pas fuité. */
export async function pwnedPasswordError(password: string) {
  const count = await pwnedCount(password);
  if (!count) return null;
  return `Ce mot de passe apparaît dans des fuites de données connues (${count.toLocaleString('fr-FR')} fois) : des pirates l’essaient en premier. Choisissez-en un autre.`;
}
