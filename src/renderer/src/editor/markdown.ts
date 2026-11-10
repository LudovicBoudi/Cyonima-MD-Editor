import { marked } from 'marked'
import type { Token } from 'marked'
import TurndownService from 'turndown'
import { decodeRawHtml, encodeRawHtml } from './rawHtmlSerialization'

marked.setOptions({ gfm: true, breaks: false })

interface ReferenceDefinition {
  id: string
  href: string
  title: string
}

type ReferenceLinkStyle = 'full' | 'collapsed' | 'shortcut'

/**
 * Marked resolves reference links while parsing and throws away their
 * identifier. Keeping a map of labels lets the editor mark links that must be
 * written back as references.
 */
let activeReferenceDefinitions = new Map<string, ReferenceDefinition>()

const normalizeReferenceLabel = (label: string): string =>
  label.trim().replace(/\s+/g, ' ').toLowerCase()

const REFERENCE_DEFINITION_LINE =
  /^ {0,3}\[([^\]\n]+)\]:[ \t]*(?:<([^>\n]*)>|(\S+))(?:[ \t]+(?:"([^"\n]*)"|'([^'\n]*)'|\(([^)\n]*)\)))?[ \t]*$/

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Collects link reference definitions before parsing. A definition only counts
 * at a block boundary (like in CommonMark), so a line that is really part of a
 * paragraph is not mistaken for one.
 */
function collectReferenceDefinitions(markdown: string): Map<string, ReferenceDefinition> {
  const definitions = new Map<string, ReferenceDefinition>()
  let fence: { marker: string; length: number } | null = null
  let previousBlank = true
  let previousDefinition = false

  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line)

    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence.marker &&
        fenceMatch[1].length >= fence.length
      ) {
        fence = null
      }
      previousBlank = false
      previousDefinition = false
      continue
    }

    if (fenceMatch) {
      fence = { marker: fenceMatch[1][0], length: fenceMatch[1].length }
      previousBlank = false
      previousDefinition = false
      continue
    }

    const match = REFERENCE_DEFINITION_LINE.exec(line)
    if (match && !match[1].startsWith('^') && (previousBlank || previousDefinition)) {
      definitions.set(normalizeReferenceLabel(match[1]), {
        id: match[1],
        href: match[2] ?? match[3] ?? '',
        title: match[4] ?? match[5] ?? match[6] ?? ''
      })
      previousBlank = false
      previousDefinition = true
      continue
    }

    previousBlank = /^[ \t]*$/.test(line)
    previousDefinition = false
  }

  return definitions
}

const ALIGNED_BLOCK = /^<(p|h[1-4])[ \t]+align="(left|center|right)"[ \t]*>([\s\S]*?)<\/\1>[ \t]*(?:\n|$)/

/**
 * `<p align="center">…</p>` is how alignment is written to Markdown, since
 * Markdown has no syntax for it. It is read as a real block, so the Markdown
 * inside stays editable instead of becoming opaque HTML.
 */
marked.use({
  extensions: [
    {
      name: 'alignedBlock',
      level: 'block',
      start(src: string) {
        const index = src.search(/<(?:p|h[1-4])[ \t]+align="/)
        return index >= 0 ? index : undefined
      },
      tokenizer(src: string) {
        const match = ALIGNED_BLOCK.exec(src)
        if (!match) return undefined
        const [raw, tag, align, inner] = match
        const content = inner.trim()
        const multiBlock = /\n[ \t]*\n/.test(inner)
        return {
          type: 'alignedBlock',
          raw,
          tag,
          align,
          multiBlock,
          tokens: multiBlock ? this.lexer.blockTokens(content) : this.lexer.inlineTokens(content)
        }
      },
      renderer(token) {
        const tokens = (token.tokens ?? []) as Token[]
        const style = `text-align: ${token.align}`
        if (!token.multiBlock) {
          return `<${token.tag} style="${style}">${this.parser.parseInline(tokens)}</${token.tag}>\n`
        }
        // Nested blocks cannot sit inside one <p>, so each paragraph gets the alignment.
        return tokens
          .map((block) =>
            block.type === 'paragraph'
              ? `<${token.tag} style="${style}">${this.parser.parseInline(block.tokens ?? [])}</${token.tag}>\n`
              : this.parser.parse([block])
          )
          .join('')
      }
    }
  ]
})

marked.use({
  extensions: [
    {
      name: 'footnoteDefinition',
      level: 'block',
      start(src: string) {
        const index = src.search(/^\[\^([^\]\n]+)\]:/m)
        return index >= 0 ? index : undefined
      },
      tokenizer(src: string) {
        // Keep trailing newlines on each line so `raw` is an exact prefix of
        // `src`: marked advances by its length.
        const lines = src.split(/(?<=\n)/)
        const first = /^\[\^([^\]\n]+)\]:[ \t]*([^\n]*)(?:\r?\n|$)/.exec(lines[0] ?? '')
        if (!first) return undefined

        const content = [first[2].replace(/\r$/, '')]
        let consumed = 1
        let blankLines = 0

        for (let index = 1; index < lines.length; index++) {
          const line = lines[index]
          const text = line.replace(/\r?\n$/, '')
          if (/^[ \t]*$/.test(text)) {
            blankLines++
            continue
          }

          const indent = /^([ \t]+)/.exec(text)
          if (!indent || indent[1].replace(/\t/g, '    ').length < 2) break

          while (blankLines > 0) {
            content.push('')
            blankLines--
          }
          // Footnote continuation lines are commonly indented by two or four
          // spaces; the indentation itself is not part of the content.
          content.push(text.replace(/^ {1,4}/, '').replace(/^\t/, ''))
          consumed = index + 1
        }

        return {
          type: 'footnoteDefinition',
          raw: lines.slice(0, consumed).join(''),
          id: first[1],
          tokens: this.lexer.blockTokens(content.join('\n'), [])
        }
      },
      renderer(token) {
        const inner = this.parser.parse(token.tokens ?? [])
        return `<div data-footnote-definition="${escapeHtml(token.id)}">${inner || '<p></p>'}</div>\n`
      }
    },
    {
      name: 'referenceDefinition',
      level: 'block',
      start(src: string) {
        const index = src.search(/^ {0,3}\[[^\]\n^][^\]\n]*\]:/m)
        return index >= 0 ? index : undefined
      },
      tokenizer(src: string) {
        const match =
          /^ {0,3}\[([^\]\n]+)\]:[ \t]*(?:<([^>\n]*)>|(\S+))(?:[ \t]+(?:"([^"\n]*)"|'([^'\n]*)'|\(([^)\n]*)\)))?[ \t]*(?:\r?\n|$)/.exec(
            src
          )
        if (!match || match[1].startsWith('^')) return undefined

        return {
          type: 'referenceDefinition',
          raw: match[0],
          id: match[1],
          href: match[2] ?? match[3] ?? '',
          title: match[4] ?? match[5] ?? match[6] ?? ''
        }
      },
      renderer(token) {
        return `<div data-reference-definition="${escapeHtml(token.id)}" data-href="${escapeHtml(token.href)}" data-title="${escapeHtml(token.title)}">\u200B</div>\n`
      }
    },
    {
      name: 'footnoteReference',
      level: 'inline',
      start(src: string) {
        const index = src.indexOf('[^')
        return index >= 0 ? index : undefined
      },
      tokenizer(src: string) {
        const match = /^\[\^([^\]\n]+)\]/.exec(src)
        if (!match) return undefined
        return { type: 'footnoteReference', raw: match[0], id: match[1] }
      },
      renderer(token) {
        return `<sup data-footnote-ref="${escapeHtml(token.id)}">${escapeHtml(token.id)}</sup>`
      }
    },
    {
      name: 'referenceLink',
      level: 'inline',
      start(src: string) {
        const index = src.indexOf('[')
        return index >= 0 ? index : undefined
      },
      tokenizer(src: string) {
        if (src[0] !== '[') return undefined

        const full = /^\[([^\]\n]*)\]\[([^\]\n]*)\]/.exec(src)
        if (full) {
          const definition = activeReferenceDefinitions.get(
            normalizeReferenceLabel(full[2] || full[1])
          )
          if (!definition) return undefined

          return {
            type: 'referenceLink',
            raw: full[0],
            id: definition.id,
            style: full[2] ? 'full' : 'collapsed',
            tokens: this.lexer.inlineTokens(full[1])
          }
        }

        // A shortcut reference must not steal an inline link or an image.
        const shortcut = /^\[([^\]\n]+)\](?![\[(])/.exec(src)
        if (!shortcut) return undefined
        const definition = activeReferenceDefinitions.get(normalizeReferenceLabel(shortcut[1]))
        if (!definition) return undefined

        return {
          type: 'referenceLink',
          raw: shortcut[0],
          id: definition.id,
          style: 'shortcut',
          tokens: this.lexer.inlineTokens(shortcut[1])
        }
      },
      renderer(token) {
        const definition = activeReferenceDefinitions.get(normalizeReferenceLabel(token.id))
        const title = definition?.title ? ` title="${escapeHtml(definition.title)}"` : ''
        return `<a href="${escapeHtml(definition?.href ?? '')}"${title} data-reference-id="${escapeHtml(token.id)}" data-reference-style="${token.style}">${this.parser.parseInline(token.tokens ?? [])}</a>`
      }
    }
  ]
})

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
    // Absolute web/mail/anchor links and plain relative paths are kept;
    // unknown schemes (javascript:, data:, vbscript:, …) are removed.
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(href)
    const allowedScheme = /^(?:https?:|mailto:|#)/i.test(href)
    if (hasScheme && !allowedScheme) link.removeAttribute('href')
  })

  doc.querySelectorAll('img[src]').forEach((image) => {
    const src = image.getAttribute('src') ?? ''
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(src)
    const windowsPath = /^[a-z]:[\\/]/i.test(src)
    const allowedScheme = /^(?:https?:|data:image\/|file:|local-file:)/i.test(src)
    if ((hasScheme && !windowsPath && !allowedScheme) || /^(?:javascript|vbscript):/i.test(src)) {
      image.removeAttribute('src')
    }
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
  activeReferenceDefinitions = collectReferenceDefinitions(markdown)
  try {
    const html = marked.parse(protectRawHtmlBlocks(markdown), { async: false }) as string
    return sanitizeHtml(normalizeTaskList(html))
  } finally {
    activeReferenceDefinitions = new Map()
  }
}

let turndown: TurndownService | null = null

const ALIGNABLE_TAGS = ['P', 'H1', 'H2', 'H3', 'H4']

/** Only centred and right alignment need writing: left is the default. */
function alignmentOf(element: HTMLElement): 'center' | 'right' | null {
  const match = /text-align:\s*(center|right)/i.exec(element.getAttribute('style') ?? '')
  return match ? (match[1].toLowerCase() as 'center' | 'right') : null
}

function hasReferenceDefinition(node: HTMLElement, id: string): boolean {
  return Array.from(node.ownerDocument.querySelectorAll('div[data-reference-definition]')).some(
    (definition) => definition.getAttribute('data-reference-definition') === id
  )
}

function inlineLink(href: string, title: string, content: string): string {
  const escaped = href.replace(/([<>()])/g, '\\$1')
  const destination = escaped.includes(' ') ? `<${escaped}>` : escaped
  const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : ''
  return `[${content}](${destination}${titlePart})`
}

/**
 * Turndown skips nodes it considers blank before custom rules run. An empty
 * footnote definition must still be written, otherwise the reference in the
 * text would point to nothing.
 */
function blankReplacement(_content: string, node: HTMLElement): string {
  if (node.nodeName === 'DIV' && node.hasAttribute('data-footnote-definition')) {
    const id = node.getAttribute('data-footnote-definition') ?? ''
    return `\n\n[^${id}]:\n\n`
  }
  return ''
}

type TableAlignment = 'left' | 'center' | 'right'

function tableCellAlignment(cell: HTMLTableCellElement | undefined): TableAlignment | null {
  if (!cell) return null
  const style = /text-align:\s*(left|center|right)/i.exec(cell.getAttribute('style') ?? '')
  const value = (style?.[1] ?? cell.getAttribute('align') ?? '').toLowerCase()
  return value === 'left' || value === 'center' || value === 'right' ? value : null
}

/**
 * Markdown aligns a whole column, not individual cells. The header cell is the
 * reference, then the first body cell: this keeps a table readable when only
 * one cell of the column carries the alignment.
 */
function columnAlignments(table: HTMLTableElement, columnCount: number): (TableAlignment | null)[] {
  const cells = Array.from(table.querySelectorAll<HTMLTableCellElement>('th, td'))

  return Array.from({ length: columnCount }, (_, column) => {
    const inColumn = cells.filter((cell) => cell.cellIndex === column)
    const header = inColumn.find((cell) => cell.tagName === 'TH')
    const body = inColumn.find((cell) => cell.tagName !== 'TH')
    return tableCellAlignment(header) ?? tableCellAlignment(body)
  })
}

function alignmentSeparator(alignment: TableAlignment | null): string {
  switch (alignment) {
    case 'left':
      return ':---'
    case 'center':
      return ':---:'
    case 'right':
      return '---:'
    default:
      return '---'
  }
}

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
    linkStyle: 'inlined',
    blankReplacement
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

  service.addRule('alignedBlock', {
    filter: (node) =>
      ALIGNABLE_TAGS.includes(node.nodeName) && alignmentOf(node as HTMLElement) !== null,
    replacement: (content, node) => {
      const tag = node.nodeName.toLowerCase()
      return `\n\n<${tag} align="${alignmentOf(node as HTMLElement)}">${content.trim()}</${tag}>\n\n`
    }
  })

  service.addRule('footnoteReference', {
    filter: (node) =>
      node.nodeName === 'SUP' && (node as HTMLElement).hasAttribute('data-footnote-ref'),
    replacement: (_content, node) => {
      const id = (node as HTMLElement).getAttribute('data-footnote-ref') ?? ''
      return `[^${id}]`
    }
  })

  service.addRule('footnoteDefinition', {
    filter: (node) =>
      node.nodeName === 'DIV' && (node as HTMLElement).hasAttribute('data-footnote-definition'),
    replacement: (content, node) => {
      const id = (node as HTMLElement).getAttribute('data-footnote-definition') ?? ''
      const text = content.replace(/^\n+/, '').replace(/\n+$/, '')
      const lines = text ? text.split('\n') : ['']
      const first = lines.shift() ?? ''
      const rest = lines.map((line) => (line.trim() ? `    ${line}` : '')).join('\n')

      return `\n\n[^${id}]: ${first}${rest ? `\n${rest}` : ''}\n\n`
    }
  })

  service.addRule('referenceDefinition', {
    filter: (node) =>
      node.nodeName === 'DIV' && (node as HTMLElement).hasAttribute('data-reference-definition'),
    replacement: (_content, node) => {
      const element = node as HTMLElement
      const id = element.getAttribute('data-reference-definition') ?? ''
      const href = element.getAttribute('data-href') ?? ''
      const title = element.getAttribute('data-title') ?? ''
      const destination = href.replace(/([<>()])/g, '\\$1')
      const wrapped = destination.includes(' ') ? `<${destination}>` : destination
      const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : ''

      return `\n\n[${id}]: ${wrapped}${titlePart}\n\n`
    }
  })

  service.addRule('referenceLink', {
    filter: (node) =>
      node.nodeName === 'A' && (node as HTMLElement).hasAttribute('data-reference-id'),
    replacement: (content, node) => {
      const element = node as HTMLElement
      const id = element.getAttribute('data-reference-id') ?? ''
      const style = (element.getAttribute('data-reference-style') ??
        'full') as ReferenceLinkStyle
      const text = content.replace(/\n+/g, ' ').trim()

      if (!hasReferenceDefinition(element, id)) {
        return inlineLink(element.getAttribute('href') ?? '', element.getAttribute('title') ?? '', text)
      }

      if (style === 'shortcut' && normalizeReferenceLabel(text) === normalizeReferenceLabel(id)) {
        return `[${text}]`
      }
      if (style === 'collapsed') return `[${text}][]`
      return `[${text}][${id}]`
    }
  })

  service.addRule('underline', {
    filter: ['u'],
    replacement: (content) => `<u>${content}</u>`
  })

  // Inline tags written back exactly as they were typed: Markdown has no syntax for them.
  // Footnote references are <sup data-footnote-ref>: they have their own rule.
  service.addRule('inlineHtmlMark', {
    filter: (node) =>
      ['SUB', 'SUP', 'KBD'].includes(node.nodeName) && !node.hasAttribute('data-footnote-ref'),
    replacement: (content, node) => {
      const tag = node.nodeName.toLowerCase()
      return `<${tag}>${content}</${tag}>`
    }
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
      const alignments = table ? columnAlignments(table, cellCount) : []
      const separator = `| ${alignments
        .map((alignment) => alignmentSeparator(alignment))
        .join(' | ')} |`

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
