import type { DocumentFont, Language, TypographySettings } from '../../../shared/types'
import { normalizeTypography } from '../../../shared/typography'
import { markdownToHtml, resolveLocalImages, splitFrontmatter } from './markdown'
import { decodeRawHtml } from './rawHtmlSerialization'

export interface HtmlExportOptions {
  /** Markdown source, frontmatter included. The frontmatter is used for the title only. */
  markdown: string
  /** Current document name, used when the frontmatter has no title. */
  fileName: string
  typography: TypographySettings
  /** Absolute directory of the current document, used to resolve local images. */
  documentDir: string | null
  /** Interface language, written as the document `lang` attribute. */
  language?: Language
}

const FONT_STACKS: Record<DocumentFont, string> = {
  serif: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif',
  sans: '"Inter", "SF Pro Text", "Segoe UI", system-ui, -apple-system, sans-serif',
  mono: 'ui-monospace, "SFMono-Regular", "Cascadia Code", Menlo, Consolas, monospace'
}

const DANGEROUS_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'noscript'
].join(',')

const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'poster'])

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Reads a simple top-level `title:` from the YAML frontmatter, if present. */
export function frontmatterTitle(frontmatter: string | null): string | null {
  if (!frontmatter) return null

  const lines = frontmatter.split(/\r?\n/)
  const index = lines.findIndex((line) => /^title[ \t]*:/.test(line))
  if (index < 0) return null

  let value = lines[index].replace(/^title[ \t]*:[ \t]*/, '').trim()

  // Literal (`|`) and folded (`>`) block scalars continue on indented lines.
  if (/^[|>][-+]?\s*(?:#.*)?$/.test(value)) {
    const folded = value.startsWith('>')
    const content: string[] = []
    for (const line of lines.slice(index + 1)) {
      if (!/^[ \t]+/.test(line)) break
      content.push(line.replace(/^[ \t]+/, ''))
    }
    const text = folded
      ? content.join(' ').replace(/\s+/g, ' ').trim()
      : content.join('\n').trim()
    return text || null
  }

  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      value = value.slice(1, -1)
    }
  }

  return value.trim() || null
}

export function titleFromFileName(fileName: string): string {
  const stripped = fileName.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '').trim()
  return stripped || 'Document'
}

/** Title of an export: the frontmatter `title`, else the file name. */
export function documentTitle(markdown: string, fileName: string): string {
  const parts = splitFrontmatter(markdown)
  return frontmatterTitle(parts.frontmatter) ?? titleFromFileName(fileName)
}

/**
 * Raw HTML is preserved, but active content that a Markdown editor would not
 * execute is stripped: scripts, embedded frames, stylesheets, inline event
 * handlers and javascript: URLs.
 */
function sanitizeRawFragment(root: ParentNode): void {
  root.querySelectorAll(DANGEROUS_TAGS).forEach((node) => node.remove())

  root.querySelectorAll('*').forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()

      if (name.startsWith('on') || name === 'srcdoc') {
        element.removeAttribute(attribute.name)
        continue
      }

      if (URL_ATTRIBUTES.has(name)) {
        const value = attribute.value.trim()
        if (/^(?:javascript|vbscript|data:text\/html)/i.test(value)) {
          element.removeAttribute(attribute.name)
        }
      }
    }
  })
}

/**
 * Turns a placeholder block into the real HTML it carries. This happens after
 * the editor-specific transformations so that only generated elements are
 * rewritten, never the user's raw markup.
 */
function revealRawHtml(doc: Document): void {
  doc.querySelectorAll('div[data-raw-html]').forEach((placeholder) => {
    const source = decodeRawHtml(placeholder.getAttribute('data-raw-html'))
    if (!source.trim()) {
      placeholder.remove()
      return
    }

    const template = doc.createElement('template')
    template.innerHTML = source
    sanitizeRawFragment(template.content)
    placeholder.replaceWith(template.content)
  })
}

function footnoteSlugs(doc: Document): Map<string, string> {
  const slugs = new Map<string, string>()
  const used = new Set<string>()

  const register = (id: string): void => {
    if (slugs.has(id)) return

    const base =
      id
        .trim()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'note'

    let slug = base
    let index = 2
    while (used.has(slug)) {
      slug = `${base}-${index}`
      index++
    }

    used.add(slug)
    slugs.set(id, slug)
  }

  doc
    .querySelectorAll<HTMLElement>('[data-footnote-definition], [data-footnote-ref]')
    .forEach((element) => {
      const id =
        element.getAttribute('data-footnote-definition') ??
        element.getAttribute('data-footnote-ref') ??
        ''
      register(id)
    })

  return slugs
}

/**
 * The editor stores footnotes as `sup`/`div` pairs. The export turns them into
 * ordinary anchors, which work in any browser without the application.
 */
function transformFootnotes(doc: Document): void {
  const slugs = footnoteSlugs(doc)
  const referenceCounts = new Map<string, number>()

  doc.querySelectorAll<HTMLElement>('sup[data-footnote-ref]').forEach((reference) => {
    const id = reference.getAttribute('data-footnote-ref') ?? ''
    const slug = slugs.get(id) ?? 'note'
    const count = (referenceCounts.get(slug) ?? 0) + 1
    referenceCounts.set(slug, count)

    reference.removeAttribute('data-footnote-ref')
    reference.classList.add('footnote-ref')
    reference.id = count === 1 ? `fnref-${slug}` : `fnref-${slug}-${count}`

    const anchor = doc.createElement('a')
    anchor.href = `#fn-${slug}`
    anchor.textContent = id
    reference.textContent = ''
    reference.appendChild(anchor)
  })

  doc.querySelectorAll<HTMLElement>('div[data-footnote-definition]').forEach((definition) => {
    const id = definition.getAttribute('data-footnote-definition') ?? ''
    const slug = slugs.get(id) ?? 'note'

    definition.removeAttribute('data-footnote-definition')
    definition.classList.add('footnote')
    definition.id = `fn-${slug}`

    const label = doc.createElement('span')
    label.className = 'footnote-label'
    label.textContent = `[${id}]`
    definition.insertBefore(label, definition.firstChild)
  })
}

function transformTaskLists(doc: Document): void {
  doc.querySelectorAll<HTMLElement>('ul[data-type="taskList"]').forEach((list) => {
    list.classList.add('task-list')
    list.removeAttribute('data-type')
  })

  doc.querySelectorAll<HTMLElement>('li[data-type="taskItem"]').forEach((item) => {
    const checked = item.getAttribute('data-checked') === 'true'
    item.classList.add('task-list-item')
    item.removeAttribute('data-type')
    item.removeAttribute('data-checked')

    const checkbox = doc.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.disabled = true
    if (checked) checkbox.setAttribute('checked', '')
    item.insertBefore(checkbox, item.firstChild)
  })
}

function transformTables(doc: Document): void {
  doc.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('table-scroll')) return

    const wrapper = doc.createElement('div')
    wrapper.className = 'table-scroll'
    table.replaceWith(wrapper)
    wrapper.appendChild(table)
  })
}

function transformLinks(doc: Document): void {
  doc.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    if (/^https?:/i.test(link.getAttribute('href') ?? '')) {
      link.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

/**
 * Applies the export transformations shared by HTML and PDF exports: footnotes,
 * task lists, tables, reference placeholders and raw HTML blocks become plain
 * HTML that any browser can display.
 */
export function prepareExportDocument(editorHtml: string): Document {
  const doc = new DOMParser().parseFromString(editorHtml, 'text/html')

  transformFootnotes(doc)
  doc.querySelectorAll('[data-reference-definition]').forEach((node) => node.remove())
  transformTaskLists(doc)
  transformTables(doc)
  transformLinks(doc)
  revealRawHtml(doc)

  return doc
}

/**
 * Builds the body of the export from the editor HTML, rewriting local image
 * sources against the document directory when it is known.
 */
function exportBody(editorHtml: string, documentDir: string | null): string {
  const html = prepareExportDocument(editorHtml).body.innerHTML
  return documentDir ? resolveLocalImages(html, documentDir) : html
}

export const BASE_CSS = `
*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  background: var(--page-bg);
  color-scheme: light;
}

body {
  margin: 0;
  padding: 40px 20px;
  background: var(--page-bg);
  color: var(--ink);
  font-family: var(--doc-font);
  font-size: var(--doc-font-size);
  line-height: var(--doc-line-height);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.document {
  max-width: 46rem;
  margin: 0 auto;
  padding: 56px 64px 72px;
  border-radius: 10px;
  background: var(--paper);
  box-shadow: 0 10px 40px rgba(36, 34, 30, 0.08);
}

.document > :first-child {
  margin-top: 0;
}

.document > :last-child {
  margin-bottom: 0;
}

p {
  margin: 0 0 var(--doc-paragraph-spacing);
}

h1,
h2,
h3,
h4 {
  margin: 1.8em 0 0.6em;
  color: var(--heading);
  font-weight: 700;
  line-height: 1.25;
}

h1 {
  font-size: 2em;
  letter-spacing: -0.015em;
}

h2 {
  font-size: 1.5em;
  letter-spacing: -0.01em;
}

h3 {
  font-size: 1.22em;
}

h4 {
  font-size: 1.05em;
}

ul,
ol {
  margin: 0 0 var(--doc-paragraph-spacing);
  padding-left: 1.55em;
}

li {
  margin: 0.3em 0;
}

li > p {
  margin: 0;
}

blockquote {
  margin: 1.4em 0;
  padding: 0.2em 1.2em;
  border-left: 3px solid var(--blockquote-line);
  color: var(--blockquote-ink);
}

blockquote p:last-child {
  margin-bottom: 0;
}

a {
  color: var(--accent-ink);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

a:hover {
  color: var(--accent);
}

strong {
  font-weight: 700;
}

code,
kbd,
samp {
  font-family: var(--mono);
}

code {
  padding: 0.12em 0.35em;
  border-radius: 4px;
  background: var(--code-bg);
  color: var(--code-ink);
  font-size: 0.9em;
}

pre {
  margin: 1.4em 0;
  padding: 16px 18px;
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--code-bg);
  color: var(--code-ink);
  line-height: 1.55;
}

pre code {
  padding: 0;
  border: none;
  background: none;
  font-size: 0.86em;
  white-space: pre;
}

kbd {
  padding: 0.1em 0.4em;
  border: 1px solid var(--line-strong);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--paper);
  font-size: 0.85em;
}

mark {
  padding: 0 0.12em;
  border-radius: 2px;
  background: #f7e6a2;
  color: inherit;
}

sub,
sup {
  line-height: 0;
}

img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1.2em auto;
  border-radius: 8px;
}

hr {
  margin: 2em 0;
  border: none;
  border-top: 1px solid var(--line);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--ui-font);
  font-size: 0.87em;
}

.table-scroll {
  margin: 1.4em 0;
  overflow-x: auto;
}

th,
td {
  padding: 8px 11px;
  border: 1px solid var(--line-strong);
  text-align: left;
  vertical-align: top;
}

th {
  background: var(--table-head);
  font-weight: 600;
}

[align='center'] {
  text-align: center;
}

[align='right'] {
  text-align: right;
}

[align='left'] {
  text-align: left;
}

ul.task-list {
  padding-left: 0.15em;
  list-style: none;
}

li.task-list-item {
  position: relative;
  padding-left: 1.55em;
}

li.task-list-item > input[type='checkbox'] {
  position: absolute;
  top: 0.42em;
  left: 0;
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--accent);
}

li.task-list-item > p {
  margin-bottom: 0.25em;
}

.footnote-ref {
  font-family: var(--mono);
  font-size: 0.72em;
  font-weight: 700;
  line-height: 0;
  vertical-align: super;
}

.footnote-ref a {
  text-decoration: none;
}

.footnote {
  position: relative;
  margin: 1.4em 0;
  padding: 0.15em 0 0.15em 3.4em;
  border-left: 3px solid var(--line-strong);
  color: var(--ink-soft);
}

.footnote-label {
  position: absolute;
  top: 0.28em;
  left: 0.75em;
  color: var(--accent-ink);
  font-family: var(--mono);
  font-size: 0.76em;
  font-weight: 600;
}

.footnote p {
  margin: 0.2em 0;
}

.missing-image {
  display: inline-block;
  padding: 0.2em 0.5em;
  border: 1px dashed var(--danger);
  border-radius: 4px;
  color: var(--danger);
  font-family: var(--ui-font);
  font-size: 0.85em;
}

details {
  margin: 1.2em 0;
  padding: 0.4em 0.8em;
  border: 1px solid var(--line);
  border-radius: 6px;
}

summary {
  cursor: pointer;
  font-weight: 600;
}

@media (max-width: 680px) {
  body {
    padding: 0;
  }

  .document {
    padding: 30px 22px 42px;
    border-radius: 0;
    box-shadow: none;
  }
}

@media print {
  :root {
    --page-bg: #ffffff;
    --paper: #ffffff;
  }

  html,
  body {
    background: #ffffff;
  }

  body {
    padding: 0;
    font-size: 11.5pt;
  }

  .document {
    max-width: none;
    margin: 0;
    padding: 0;
    border-radius: 0;
    box-shadow: none;
  }

  a {
    color: inherit;
  }

  pre,
  blockquote,
  table,
  img,
  .footnote {
    break-inside: avoid;
  }

  h1,
  h2,
  h3,
  h4 {
    break-after: avoid;
  }

  @page {
    margin: 18mm;
  }
}
`

/** Shared palette and typography custom properties for both export formats. */
export function typographyVariables(typography: TypographySettings): string {
  const normalized = normalizeTypography(typography)
  return `:root {
  --page-bg: #eceae3;
  --paper: #fffdf9;
  --ink: #24221e;
  --ink-soft: #4d4a43;
  --muted: #827d72;
  --line: #e3dfd5;
  --line-strong: #d5d0c4;
  --heading: #1d1b17;
  --accent: #b3542f;
  --accent-ink: #8f3f21;
  --danger: #a63d33;
  --blockquote-line: #d9b9a4;
  --blockquote-ink: #6e6a60;
  --code-bg: #f5f2ea;
  --code-ink: #24221e;
  --table-head: #f6f3ea;
  --ui-font: ${FONT_STACKS.sans};
  --mono: ${FONT_STACKS.mono};
  --doc-font: ${FONT_STACKS[normalized.fontFamily]};
  --doc-font-size: ${normalized.fontSize}px;
  --doc-line-height: ${normalized.lineHeight};
  --doc-paragraph-spacing: ${normalized.paragraphSpacing}em;
}`
}

function documentStyle(typography: TypographySettings): string {
  return `${typographyVariables(typography)}
${BASE_CSS}`
}

/**
 * Produces a complete, self-contained HTML page: document body, title, and an
 * embedded stylesheet matching the editor typography. Local images are left as
 * `local-file://` URLs at this stage; the main process replaces them with data
 * URIs because only it can read the filesystem.
 */
export function buildStandaloneHtml(options: HtmlExportOptions): string {
  const parts = splitFrontmatter(options.markdown)
  const typography = normalizeTypography(options.typography)
  const title = frontmatterTitle(parts.frontmatter) ?? titleFromFileName(options.fileName)
  const body = exportBody(markdownToHtml(parts.body), options.documentDir)

  return `<!doctype html>
<html lang="${options.language === 'en' ? 'en' : 'fr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Cyonima MD Editor">
<title>${escapeHtml(title)}</title>
<style>
${documentStyle(typography)}
</style>
</head>
<body>
<main class="document">
${body}
</main>
</body>
</html>
`
}
