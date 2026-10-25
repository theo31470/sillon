/** Les deux cases « rappels » et « annonces », partagées entre « Mon compte » et la page des préférences. */
export function EmailPrefsFields({ reminders, news }: { reminders: boolean; news: boolean }) {
  const row = (name: string, checked: boolean, title: string, text: string) => (
    <label className="flex cursor-pointer gap-3 rounded-xl border border-line p-4 transition-colors hover:border-brand/60">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-1 size-4 shrink-0 accent-brand" />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{text}</span>
      </span>
    </label>
  );
  return (
    <div className="flex flex-col gap-3">
      {row('email_reminders', reminders, 'Rappels d’entretien', 'Un e-mail quand une vidange ou un entretien approche ou est en retard. Jamais deux fois pour la même échéance.')}
      {row('email_news', news, 'Nouveautés et conseils', 'Quelques annonces par an : nouvelles fonctions, conseils de saison.')}
      <p className="text-xs text-muted">Les e-mails de sécurité (confirmation, mot de passe) sont toujours envoyés.</p>
    </div>
  );
}
