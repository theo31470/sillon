/**
 * N'autorise que les redirections internes (« /app », « /admin/membres »…)
 * pour éviter qu'un lien piégé renvoie l'utilisateur vers un site externe.
 */
export function safeNext(value: FormDataEntryValue | string | null | undefined, fallback = '/app') {
  const next = typeof value === 'string' ? value : '';
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
