/** Données structurées schema.org pour les moteurs de recherche (JSON-LD). */
export function JsonLd({ data }: { data: object | object[] }) {
  // « < » échappé : le contenu (titres saisis en admin) ne peut pas fermer la balise script.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
