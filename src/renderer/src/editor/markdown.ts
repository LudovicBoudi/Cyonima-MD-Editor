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
  const checkboxes = doc.querySelectorAll('li > input[type="checkbox"]')

  checkboxes.forEach((input) => {
    const item = input.parentElement
    const list = item?.parentElement
    if (!item || !list || (list.nodeName !== 'UL' && list.nodeName !== 'OL')) return

    const checked = input.hasAttribute('checked')
    input.remove()
    item.setAttribute('data-type', 'taskItem')
    item.setAttribute('data-checked', checked ? 'true' : 'false')
    list.setAttribute('data-type', 'taskList')

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
  const trimmed = markdown.replace(/[ \t]+$/gm, '').trim()
  return trimmed ? `${trimmed}\n` : ''
}

export function countDocumentStats(text: string): { words: number; characters: number } {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const words = normalized ? normalized.split(' ').length : 0
  return { words, characters: text.length }
}
