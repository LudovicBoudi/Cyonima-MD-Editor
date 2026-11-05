import { marked } from 'marked'
import TurndownService from 'turndown'
import { decodeRawHtml, encodeRawHtml } from './rawHtmlSerialization'

marked.setOptions({ gfm: true, breaks: false })

export interface MarkdownParts {
  /** Raw YAML frontmatter block, delimiters included. `null` when absent. */
  frontmatter: string | null
  /** Document body, without the frontmatter block. */
  body: string
}

// YAML frontmatter must start on the very first line (an optional BOM is
// tolerated) and be closed by `---` or `...` on its own line.
const FRONTMATTER_PATTERN =
  /^\uFEFF?---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?(?:---|\.\.\.)[ \t]*(?=\r?\n|$)/

export function splitFrontmatter(markdown: string): MarkdownParts {
  const match = FRONTMATTER_PATTERN.exec(markdown)
  if (!match) return { frontmatter: null, body: markdown }

  return {
    frontmatter: match[0],
    body: markdown.slice(match[0].length).replace(/^(?:\r?\n)+/, '')
  }
}

export function joinFrontmatter(frontmatter: string | null, body: string): string {
  const block = frontmatter?.replace(/(?:\r?\n)+$/, '') ?? ''
  const content = body.replace(/^(?:\r?\n)+/, '')

  if (!block) return content
  if (!content) return `${block}\n`
  return `${block}\n\n${content.endsWith('\n') ? content : `${content}\n`}`
}

function normalizeTaskList(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const checkboxes = doc.querySelectorAll('li input[type="checkbox"]')

  checkboxes.forEach((input) => {
    const item = input.closest('li')
    const list = item?.parentElement
    if (!item || !list || (list.nodeName !== 'UL' && list.nodeName !== 'OL')) return

    const checked = input.hasAttribute('checked')
    // In "loose" lists the checkbox sits inside the item paragraph; in "tight"
    // lists it is a direct child of the <li>.
    const wasWrapped = input.parentElement?.nodeName === 'P'

    input.remove()
    item.setAttribute('data-type', 'taskItem')
    item.setAttribute('data-checked', checked ? 'true' : 'false')
    list.setAttribute('data-type', 'taskList')

    if (wasWrapped) {
      // Drop the whitespace left behind by the removed checkbox.
      const paragraph = item.querySelector('p')
      const first = paragraph?.firstChild
      if (first && first.nodeType === 3) {
        first.textContent = first.textContent?.replace(/^\s+/, '') ?? ''
      }
      return
    }

    const hasParagraph = Array.from(item.children).some((child) => child.nodeName === 'P')
    if (!hasParagraph) {
      const paragraph = doc.createElement('p')
      let child = item.firstChild
      while (child && child.nodeName !== 'UL' && child.nodeName !== 'OL') {
        const next = child.nextSibling
        paragraph.appendChild(child)
        child = next
      }
      if (paragraph.childNodes.length > 0) item.insertBefore(paragraph, item.firstChild)
    }
  })

  return doc.body.innerHTML
}

function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((node) => {
    node.remove()
  })

  doc.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href') ?? ''
    if (!/^(https?:|mailto:|#|\.{0,2}\/)/i.test(href)) link.removeAttribute('href')
  })

  doc.querySelectorAll('img[src]').forEach((image) => {
    const src = image.getAttribute('src') ?? ''
    if (!/^(https?:|data:image\/|file:|\.{0,2}\/)/i.test(src)) image.removeAttribute('src')
  })

  return doc.body.innerHTML
}

/**
 * Replaces top-level raw HTML blocks with safe placeholders before Markdown is
 * parsed. The original source is percent-encoded, so it travels through the
 * editor as inert text instead of being interpreted as markup.
 */
function protectRawHtmlBlocks(markdown: string): string {
  if (!markdown.includes('<')) return markdown

  return marked
    .lexer(markdown)
    .map((token) => {
      if (token.type !== 'html' || !token.block) return token.raw

      const source = token.raw
        .replace(/^(?:\r?\n)+/, '')
        .replace(/(?:\r?\n)+$/, '')
      // The zero-width space keeps Turndown from treating the placeholder as
      // an empty node, which would bypass the custom serialization rule.
      return `\n\n<div data-raw-html="${encodeRawHtml(source)}">\u200B</div>\n\n`
    })
    .join('')
}

export function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return ''
  const html = marked.parse(protectRawHtmlBlocks(markdown), { async: false }) as string
  return sanitizeHtml(normalizeTaskList(html))
}

let turndown: TurndownService | null = null

function getTurndown(): TurndownService {
  if (turndown) return turndown

  const service = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined'
  })

  service.addRule('fencedCodeBlock', {
    filter: (node, options) =>
      options.codeBlockStyle === 'fenced' &&
      node.nodeName === 'PRE' &&
      node.firstChild?.nodeName === 'CODE',
    replacement: (_content, node) => {
      const code = node.firstChild as HTMLElement
      const language = (code.className.match(/language-([\w+-]+)/) ?? [])[1] ?? ''
      const text = (code.textContent ?? '').replace(/\n$/, '')
      return `\n\n${'```'}${language}\n${text}\n${'```'}\n\n`
    }
  })

  service.addRule('rawHtmlBlock', {
    filter: (node) =>
      node.nodeName === 'DIV' && (node as HTMLElement).hasAttribute('data-raw-html'),
    replacement: (_content, node) => {
      const source = decodeRawHtml((node as HTMLElement).getAttribute('data-raw-html'))
      return source ? `\n\n${source}\n\n` : ''
    }
  })

  service.addRule('underline', {
    filter: ['u'],
    replacement: (content) => `<u>${content}</u>`
  })

  // Preserve text color: <span style="color:#hex"> → <span style="color:#hex">
  // Standard Markdown has no syntax for colored text; raw HTML is the only
  // portable option accepted by GitHub, Pandoc, and most Markdown viewers.
  service.addRule('coloredSpan', {
    filter: (node) => {
      if (node.nodeName !== 'SPAN') return false
      const style = (node as HTMLElement).getAttribute('style') ?? ''
      return /color\s*:/i.test(style)
    },
    replacement: (content, node) => {
      const style = (node as HTMLElement).getAttribute('style') ?? ''
      // Extract only the color part to keep the output tidy.
      const colorMatch = style.match(/(?:^|;)\s*(color\s*:\s*[^;]+)/i)
      if (!colorMatch) return content
      const colorStyle = colorMatch[1].trim()
      return `<span style="${colorStyle}">${content}</span>`
    }
  })

  // Preserve highlighted text: <mark style="background-color:#hex"> → <mark …>
  service.addRule('highlight', {
    filter: (node) => node.nodeName === 'MARK',
    replacement: (content, node) => {
      const style = (node as HTMLElement).getAttribute('style') ?? ''
      const bgMatch = style.match(/(?:^|;)\s*(background-color\s*:\s*[^;]+)/i)
      if (bgMatch) {
        const bgStyle = bgMatch[1].trim()
        return `<mark style="${bgStyle}">${content}</mark>`
      }
      return `<mark>${content}</mark>`
    }
  })

  service.addRule('strikethrough', {
    filter: (node) => ['DEL', 'S', 'STRIKE'].includes(node.nodeName),
    replacement: (content) => `~~${content}~~`
  })

  service.addRule('listItem', {
    filter: (node) =>
      node.nodeName === 'LI' && (node as HTMLElement).getAttribute('data-type') !== 'taskItem',
    replacement: (content, node, options) => {
      const item = node as HTMLLIElement
      const parent = item.parentElement
      const text = content
        .replace(/^\n+/, '')
        .replace(/\n+$/, '')
        .replace(/\n/g, '\n    ')

      let marker = `${options.bulletListMarker} `
      if (parent?.nodeName === 'OL') {
        const start = Number((parent as HTMLOListElement).getAttribute('start')) || 1
        const index = Array.prototype.indexOf.call(parent.children, item)
        marker = `${start + index}. `
      }

      return `${marker}${text}\n`
    }
  })

  service.addRule('taskListItem', {
    filter: (node) =>
      node.nodeName === 'LI' && (node as HTMLElement).getAttribute('data-type') === 'taskItem',
    replacement: (content, node) => {
      const checked = (node as HTMLElement).getAttribute('data-checked') === 'true'
      const text = content
        .replace(/^\n+/, '')
        .replace(/\n+$/, '')
        .replace(/\n/g, '\n    ')
      return `- [${checked ? 'x' : ' '}] ${text}\n`
    }
  })

  service.addRule('table', {
    filter: (node) => node.nodeName === 'TABLE',
    replacement: (content) => `\n\n${content.replace(/^\n+|\n+$/g, '')}\n\n`
  })

  service.addRule('tableSection', {
    filter: ['thead', 'tbody', 'tfoot'],
    replacement: (content) => content
  })

  service.addRule('tableRow', {
    filter: (node) => node.nodeName === 'TR',
    replacement: (content, node) => {
      const row = node as HTMLTableRowElement
      const table = row.closest('table')
      const isFirstRow = table?.rows[0] === row
      const cellCount = row.cells.length
      if (cellCount === 0) return ''

      const rowText = content.replace(/^\n+|\n+$/g, '')
      if (!isFirstRow) return `\n${rowText}`

      const hasHeading = Array.from(row.cells).every((cell) => cell.tagName === 'TH')
      const separator = `| ${Array.from({ length: cellCount }, () => '---').join(' | ')} |`

      if (hasHeading) return `\n${rowText}\n${separator}`

      const emptyHeading = `| ${Array.from({ length: cellCount }, () => ' ').join(' | ')} |`
      return `\n${emptyHeading}\n${separator}\n${rowText}`
    }
  })

  service.addRule('tableCell', {
    filter: ['th', 'td'],
    replacement: (content, node) => {
      const cell = node as HTMLTableCellElement
      const prefix = cell.cellIndex === 0 ? '| ' : ' '
      const text = content.replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim()
      return `${prefix}${text} |`
    }
  })

  turndown = service
  return service
}

export function htmlToMarkdown(html: string): string {
  const markdown = getTurndown().turndown(html)
  const trimmed = markdown.trim()
  return trimmed ? `${trimmed}\n` : ''
}

export function countDocumentStats(text: string): { words: number; characters: number } {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const words = normalized ? normalized.split(' ').length : 0
  return { words, characters: text.length }
}

// ---------------------------------------------------------------------------
// Local image path resolution
// ---------------------------------------------------------------------------

/**
 * Returns true when a src value refers to a local file (not a remote URL,
 * data URI, or already a local-file: URL).
 */
function isLocalPath(src: string): boolean {
  return (
    !src.startsWith('http://') &&
    !src.startsWith('https://') &&
    !src.startsWith('data:') &&
    !src.startsWith('blob:') &&
    !src.startsWith('local-file://')
  )
}

/** Collapses `.` and `..` segments without touching the filesystem. */
function normalizeLocalPath(path: string): string {
  const absolute = path.startsWith('/')
  const segments = path.split('/')
  const result: string[] = []

  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (result.length > 0 && result[result.length - 1] !== '..') result.pop()
      else if (!absolute) result.push('..')
      continue
    }
    result.push(segment)
  }

  return (absolute ? '/' : '') + result.join('/')
}

/**
 * Rewrites relative (or absolute file:) image src values in an HTML string to
 * `local-file:///absolute/path` URIs so that the renderer can display them
 * regardless of Electron's webSecurity settings or the dev/prod context.
 *
 * @param html        HTML produced by markdownToHtml()
 * @param documentDir Absolute directory of the currently open Markdown file
 */
export function resolveLocalImages(html: string, documentDir: string): string {
  if (!documentDir) return html

  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src') ?? ''
    if (!isLocalPath(src)) return

    // Strip a leading file:// if present so we work with a plain path.
    const plain = src.startsWith('file://') ? decodeURIComponent(src.slice(7)) : src

    // Build the absolute path. A leading / means it is already absolute.
    const joined = plain.startsWith('/') ? plain : `${documentDir}/${plain}`
    const abs = normalizeLocalPath(joined)

    img.setAttribute('src', `local-file://${abs}`)
  })
  return doc.body.innerHTML
}

/**
 * Converts `local-file:///absolute/path` src values back to paths that are
 * relative to `documentDir` (for saving) or keeps them absolute when no
 * documentDir is known yet (unsaved document).
 *
 * This is called on the HTML just before Turndown converts it to Markdown so
 * that the saved file contains portable relative paths.
 *
 * @param html        HTML from editor.getHTML()
 * @param documentDir Absolute directory of the currently open Markdown file,
 *                    or null when the document has never been saved.
 */
export function unresolveLocalImages(html: string, documentDir: string | null): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src') ?? ''
    if (!src.startsWith('local-file://')) return

    const absPath = decodeURIComponent(src.slice('local-file://'.length))

    if (!documentDir) {
      // Document not yet saved — keep absolute path so it still works if the
      // user saves to a location near the image.
      img.setAttribute('src', absPath)
      return
    }

    // Compute a path relative to the document directory.
    const docParts = documentDir.split('/')
    const imgParts = absPath.split('/')

    // Find the common prefix length.
    let common = 0
    while (common < docParts.length && common < imgParts.length && docParts[common] === imgParts[common]) {
      common++
    }

    const upCount = docParts.length - common
    const downParts = imgParts.slice(common)
    const relative = [...Array(upCount).fill('..'), ...downParts].join('/')

    img.setAttribute('src', relative || absPath)
  })
  return doc.body.innerHTML
}
