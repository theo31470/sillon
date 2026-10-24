/**
 * Rendu Markdown minimal et SÛR pour les articles du blog.
 * Tout le HTML saisi est d'abord échappé : impossible d'injecter un script,
 * même si un compte admin était compromis. Syntaxe prise en charge :
 *   ## Titre, ### Sous-titre, - liste, 1. liste numérotée,
 *   **gras**, *italique*, [lien](https://…) et paragraphes.
 */

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeUrl(url: string) {
  const u = url.trim();
  if (/^https?:\/\//i.test(u) || (u.startsWith('/') && !u.startsWith('//'))) return u;
  return '#';
}

function inline(text: string) {
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const href = safeUrl(url.replace(/&amp;/g, '&'));
    const external = /^https?:/i.test(href);
    return `<a href="${escapeHtml(href)}"${external ? ' rel="noopener noreferrer nofollow" target="_blank"' : ''}>${label}</a>`;
  });
  return out;
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) html.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if ((m = line.match(/^###\s+(.*)$/))) {
      flushParagraph(); flushList();
      html.push(`<h3>${inline(m[1])}</h3>`);
    } else if ((m = line.match(/^##\s+(.*)$/))) {
      flushParagraph(); flushList();
      html.push(`<h2>${inline(m[1])}</h2>`);
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushParagraph();
      if (list?.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; }
      list!.items.push(m[1]);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushParagraph();
      if (list?.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; }
      list!.items.push(m[1]);
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return html.join('\n');
}
