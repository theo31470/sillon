/**
 * Gabarit HTML des e-mails Tracteurs & Co.
 *
 * Les logiciels de messagerie (Gmail, Outlook, Apple Mail…) ne comprennent
 * qu'un HTML ancien : mise en page en tableaux, styles écrits sur chaque
 * balise, images en PNG (pas de SVG). Ce module ne dépend de rien côté
 * serveur : l'admin s'en sert aussi pour l'aperçu dans le navigateur.
 */

export const EMAIL_COLORS = {
  page: '#efebe5',
  card: '#ffffff',
  header: '#12110f',
  accent: '#e0875a',
  brand: '#b25a2e',
  ink: '#1b1916',
  text: '#3d3832',
  muted: '#6b6358',
  line: '#e6e0d7',
  soft: '#f7f3ee',
  danger: '#b3261e',
  dangerSoft: '#fbeae8',
  warn: '#8a5a00',
  warnSoft: '#fdf3df',
  ok: '#2f6d3a',
  okSoft: '#e4efe3',
} as const;

const C = EMAIL_COLORS;
const FONT = "Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const DISPLAY = "Barlow, 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Le nom de la marque ne se coupe jamais en fin de ligne. */
const keepBrand = (html: string) => html.replace(/Tracteurs &amp; Co/g, 'Tracteurs&nbsp;&amp;&nbsp;Co');

/** Texte simple avec **gras** autorisé (tout le reste est échappé). */
function rich(text: string) {
  return keepBrand(escapeHtml(text))
    .replace(/\*\*(.+?)\*\*/g, `<strong style="color:${C.ink};font-weight:700">$1</strong>`)
    .replace(/\n/g, '<br>');
}
const plain = (text: string) => text.replace(/\*\*(.+?)\*\*/g, '$1');

export type DueRow = {
  machine: string;
  operation: string;
  when: string;
  level: 'retard' | 'bientot';
};

export type EmailBlock =
  | { type: 'p'; text: string }
  | { type: 'button'; label: string; url: string }
  | { type: 'code'; value: string }
  | { type: 'note'; text: string; tone?: 'info' | 'danger' }
  | { type: 'due'; rows: DueRow[] }
  | { type: 'html'; html: string; text: string }
  | { type: 'fallback'; url: string };

export type EmailContent = {
  /** Aperçu affiché sous l'objet dans la boîte de réception. */
  preheader: string;
  heading: string;
  blocks: EmailBlock[];
  /** Pourquoi la personne reçoit ce message (pied de page). */
  reason: string;
  /** Lien « gérer mes e-mails » (rappels et annonces seulement). */
  preferencesUrl?: string;
};

export type RenderedEmail = { html: string; text: string };

function blockHtml(b: EmailBlock): string {
  switch (b.type) {
    case 'p':
      return `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${C.text}">${rich(b.text)}</p>`;
    case 'button':
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td style="border-radius:10px;background:${C.brand}" bgcolor="${C.brand}"><a href="${escapeHtml(b.url)}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(b.label)}&nbsp;&rarr;</a></td></tr></table>`;
    case 'code':
      return `<p style="margin:4px 0 24px;padding:16px 20px;background:${C.soft};border:1px solid ${C.line};border-radius:12px;font-family:'SFMono-Regular',Consolas,'Courier New',monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:${C.ink};text-align:center">${escapeHtml(b.value)}</p>`;
    case 'note': {
      const danger = b.tone === 'danger';
      return `<p style="margin:0 0 16px;padding:12px 16px;border-left:4px solid ${danger ? C.danger : C.accent};background:${danger ? C.dangerSoft : C.soft};border-radius:6px;font-family:${FONT};font-size:14px;line-height:1.55;color:${C.text}">${rich(b.text)}</p>`;
    }
    case 'due': {
      const rows = b.rows
        .map((r) => {
          const late = r.level === 'retard';
          const badge = `<span style="display:inline-block;padding:3px 9px;font-family:${FONT};border-radius:999px;background:${late ? C.dangerSoft : C.warnSoft};color:${late ? C.danger : C.warn};font-size:12px;font-weight:700;white-space:nowrap">${late ? 'En retard' : 'Bientôt'}</span>`;
          return `<tr><td style="padding:12px 0;border-bottom:1px solid ${C.line};font-family:${FONT};font-size:15px;line-height:1.4;color:${C.text}"><strong style="color:${C.ink}">${escapeHtml(r.operation)}</strong><br><span style="color:${C.muted};font-size:14px">${escapeHtml(r.machine)} · ${escapeHtml(r.when)}</span></td><td align="right" style="padding:12px 0 12px 12px;border-bottom:1px solid ${C.line};vertical-align:middle">${badge}</td></tr>`;
        })
        .join('');
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-top:1px solid ${C.line}">${rows}</table>`;
    }
    case 'html':
      return b.html;
    case 'fallback':
      return `<p style="margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.muted}">Le bouton ne marche pas ? Copiez ce lien dans votre navigateur :<br><a href="${escapeHtml(b.url)}" style="color:${C.brand};word-break:break-all">${escapeHtml(b.url)}</a></p>`;
  }
}

function blockText(b: EmailBlock): string {
  switch (b.type) {
    case 'p':
    case 'note':
      return plain(b.text);
    case 'button':
      return `${b.label} :\n${b.url}`;
    case 'code':
      return b.value;
    case 'due':
      return b.rows.map((r) => `- ${r.operation} (${r.machine}) : ${r.when}${r.level === 'retard' ? ' [EN RETARD]' : ''}`).join('\n');
    case 'html':
      return b.text;
    case 'fallback':
      return '';
  }
}

export function renderEmail(content: EmailContent, opts: { siteUrl: string }): RenderedEmail {
  const site = opts.siteUrl.replace(/\/$/, '');
  const logo = `${site}/brand/email/logo-sombre.png`;
  const body = content.blocks.map(blockHtml).join('\n');
  const prefs = content.preferencesUrl
    ? ` · <a href="${escapeHtml(content.preferencesUrl)}" style="color:${C.muted};text-decoration:underline">Gérer mes e-mails</a>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.heading)}</title>
<style>
  @media (max-width:620px){ .tc-pad{padding-left:22px!important;padding-right:22px!important} .tc-h1{font-size:24px!important} }
  a{color:${C.brand}}
</style>
</head>
<body style="margin:0;padding:0;background:${C.page}" bgcolor="${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(content.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page}">
<tr><td align="center" style="padding:28px 12px 36px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
    <tr><td class="tc-pad" bgcolor="${C.header}" style="background:${C.header};padding:24px 36px;border-radius:16px 16px 0 0">
      <a href="${site}" target="_blank" style="text-decoration:none"><img src="${logo}" width="190" height="48" alt="Tracteurs &amp; Co — Machinisme agricole" style="display:block;border:0;width:190px;height:auto;color:#f3efe9;font-family:${DISPLAY};font-size:22px;font-weight:800"></a>
    </td></tr>
    <tr><td height="4" bgcolor="${C.accent}" style="background:${C.accent};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
    <tr><td class="tc-pad" bgcolor="${C.card}" style="background:${C.card};padding:36px 36px 20px;border-radius:0 0 16px 16px">
      <h1 class="tc-h1" style="margin:0 0 20px;font-family:${DISPLAY};font-size:28px;line-height:1.2;font-weight:800;color:${C.ink}">${keepBrand(escapeHtml(content.heading))}</h1>
      ${body}
    </td></tr>
    <tr><td class="tc-pad" style="padding:22px 36px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted}">
      ${escapeHtml(content.reason)}<br>
      <strong style="color:${C.text}">Tracteurs &amp; Co</strong> · Machinisme agricole · <a href="${site}" style="color:${C.muted};text-decoration:underline">${escapeHtml(site.replace(/^https?:\/\//, ''))}</a>${prefs}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    content.heading.toUpperCase(),
    '',
    ...content.blocks.map(blockText).filter(Boolean).flatMap((t) => [t, '']),
    '—',
    content.reason,
    `Tracteurs & Co · Machinisme agricole · ${site}`,
    content.preferencesUrl ? `Gérer mes e-mails : ${content.preferencesUrl}` : '',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n')
    .trim();

  return { html, text };
}

/**
 * Convertit le Markdown d'une annonce (rendu sûr du blog) en HTML d'e-mail :
 * styles écrits sur chaque balise, liens absolus.
 */
export function markdownToEmailHtml(safeHtml: string, siteUrl: string) {
  const site = siteUrl.replace(/\/$/, '');
  return keepBrand(safeHtml)
    .replace(/<p>/g, `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${C.text}">`)
    .replace(/<h2>/g, `<h2 style="margin:28px 0 12px;font-family:${DISPLAY};font-size:22px;line-height:1.25;font-weight:800;color:${C.ink}">`)
    .replace(/<h3>/g, `<h3 style="margin:22px 0 10px;font-family:${DISPLAY};font-size:18px;line-height:1.3;font-weight:700;color:${C.ink}">`)
    .replace(/<(ul|ol)>/g, `<$1 style="margin:0 0 16px;padding-left:22px;font-family:${FONT};font-size:16px;line-height:1.6;color:${C.text}">`)
    .replace(/<li>/g, '<li style="margin:0 0 6px">')
    .replace(/<strong>/g, `<strong style="color:${C.ink}">`)
    .replace(/ rel="noopener noreferrer nofollow" target="_blank"/g, '')
    .replace(/<a href="\//g, `<a href="${site}/`)
    .replace(/<a href="/g, `<a style="color:${C.brand};font-weight:600" target="_blank" href="`);
}

/** Version texte d'un Markdown d'annonce. */
export function markdownToText(md: string) {
  return md
    .replace(/\r\n/g, '\n')
    .replace(/^#{2,3}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1$2')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
    .trim();
}
