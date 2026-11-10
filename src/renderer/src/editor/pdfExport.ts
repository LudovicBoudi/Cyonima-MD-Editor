import type { PdfExportOptions, TypographySettings } from '../../../shared/types'
import {
  BASE_CSS,
  documentTitle,
  escapeHtml,
  prepareExportDocument,
  typographyVariables
} from './htmlExport'
import { markdownToHtml, resolveLocalImages, splitFrontmatter } from './markdown'

export interface PdfHtmlOptions {
  /** Markdown source, frontmatter included. The frontmatter is used for the title only. */
  markdown: string
  /** Current document name, used when the frontmatter has no title. */
  fileName: string
  typography: TypographySettings
  /** Absolute directory of the current document, used to resolve local images. */
  documentDir: string | null
  options: PdfExportOptions
}

/** Heading levels listed in the table of contents. */
const TOC_LEVELS = new Set(['H1', 'H2', 'H3'])

function headingSlug(text: string): string {
  return (
    text
      .trim()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  )
}

/**
 * Gives every heading a stable anchor and returns the entries of the table of
 * contents. Anchors are unique even when two headings share the same text.
 */
function addHeadingAnchors(doc: Document): Array<{ level: number; id: string; text: string }> {
  const used = new Set<string>()
  const entries: Array<{ level: number; id: string; text: string }> = []

  doc.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    const text = (heading.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!text) return

    const base = headingSlug(text)
    let id = base
    let index = 2
    while (used.has(id)) {
      id = `${base}-${index}`
      index++
    }
    used.add(id)
    heading.id = id

    const level = Number(heading.tagName.slice(1))
    if (TOC_LEVELS.has(heading.tagName)) entries.push({ level, id, text })
  })

  return entries
}

function buildToc(entries: Array<{ level: number; id: string; text: string }>, doc: Document): HTMLElement {
  const nav = doc.createElement('nav')
  nav.className = 'toc'
  nav.setAttribute('aria-label', 'Table des matières')

  const title = doc.createElement('h2')
  title.className = 'toc-title'
  title.textContent = 'Table des matières'
  nav.appendChild(title)

  const list = doc.createElement('ol')
  for (const entry of entries) {
    const item = doc.createElement('li')
    item.className = `toc-level-${entry.level}`

    const link = doc.createElement('a')
    link.href = `#${entry.id}`
    link.textContent = entry.text
    item.appendChild(link)
    list.appendChild(item)
  }

  nav.appendChild(list)
  return nav
}

/**
 * Print-specific rules. The table of contents and the title page may start on
 * their own page, long tables repeat their header and long code blocks wrap
 * instead of being clipped at the right edge.
 *
 * Page margins are chosen by the main process (`printToPDF`), which also places
 * the header and footer templates inside them, so no @page margin is set here.
 */
const PRINT_CSS = `
html {
  background: #ffffff;
}

body {
  margin: 0;
  padding: 0;
  background: #ffffff;
  color: var(--ink);
  font-family: var(--doc-font);
  font-size: var(--doc-font-size);
  line-height: var(--doc-line-height);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.document {
  max-width: none;
  margin: 0;
  padding: 0;
  border-radius: 0;
  background: #ffffff;
  box-shadow: none;
}

p {
  orphans: 3;
  widows: 3;
}

h1,
h2,
h3,
h4,
h5,
h6 {
  break-after: avoid;
  break-inside: avoid;
}

img {
  break-inside: avoid;
}

/* A long table must split across pages instead of overflowing: keep the header
   on every page and avoid cutting a row in half. */
table {
  break-inside: auto;
}

thead {
  display: table-header-group;
}

tfoot {
  display: table-footer-group;
}

tr {
  break-inside: avoid;
}

th,
td {
  overflow-wrap: anywhere;
}

/* Long code blocks wrap and may split; clipping the end would lose content. */
pre {
  break-inside: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

pre code {
  white-space: pre-wrap;
}

blockquote {
  break-inside: auto;
}

.footnote {
  break-inside: avoid;
}

.toc {
  margin: 0 0 2em;
  padding: 1.1em 1.5em 1.2em;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
}

.toc-title {
  margin: 0 0 0.7em;
  font-size: 1.15em;
}

.toc ol {
  margin: 0;
  padding: 0;
  list-style: none;
}

.toc li {
  margin: 0.22em 0;
}

.toc a {
  color: var(--ink);
  text-decoration: none;
}

.toc-level-2 {
  padding-left: 1.4em;
}

.toc-level-3 {
  padding-left: 2.8em;
  color: var(--ink-soft);
}

/* The document itself starts on a fresh page after the table of contents. */
nav.toc {
  break-after: page;
}

.page-break {
  break-after: page;
  height: 0;
}

body.pdf-break-h1 h1 {
  break-before: page;
}

/* Never leave a blank first page when the document opens with a heading. */
body.pdf-break-h1 .document > h1:first-child {
  break-before: auto;
}
`

/**
 * Produces the print-oriented HTML page handed to Chromium's PDF renderer.
 * Local images are still `local-file://` URLs here; the main process embeds
 * them before rendering.
 */
export function buildPrintHtml(options: PdfHtmlOptions): string {
  const title = documentTitle(options.markdown, options.fileName)
  const doc = prepareExportDocument(markdownToHtml(splitFrontmatter(options.markdown).body))
  const entries = addHeadingAnchors(doc)

  const hasToc = options.options.toc && entries.length > 0
  if (hasToc) doc.body.insertBefore(buildToc(entries, doc), doc.body.firstChild)

  const body = options.documentDir
    ? resolveLocalImages(doc.body.innerHTML, options.documentDir)
    : doc.body.innerHTML
  const bodyClass = options.options.pageBreakBeforeH1 ? ' class="pdf-break-h1"' : ''

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Cyonima MD Editor">
<title>${escapeHtml(title)}</title>
<style>
${typographyVariables(options.typography)}${BASE_CSS}${PRINT_CSS}
</style>
</head>
<body${bodyClass}>
<main class="document">
${body}
</main>
</body>
</html>
`
}
