import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { markdownToHtml, resolveLocalImages } from './markdown'

/**
 * Block-level Markdown markers at the start of a line. Inline syntax alone
 * (`**gras**`, `[lien](url)`) is not enough: plain prose often contains
 * asterisks or brackets that must stay literal.
 */
const BLOCK_MARKERS: readonly RegExp[] = [
  /^ {0,3}#{1,4}[ \t]+\S/m,
  /^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]+\S/m,
  /^ {0,3}>[ \t]?\S/m,
  /^ {0,3}(?:`{3,}|~{3,})/m,
  /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/m
]

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/m

/** True when pasted plain text carries Markdown structure worth rendering. */
export function looksLikeMarkdown(text: string): boolean {
  if (BLOCK_MARKERS.some((pattern) => pattern.test(text))) return true
  return /^\s*\|.*\|\s*$/m.test(text) && TABLE_SEPARATOR.test(text)
}

interface ParsedDelimited {
  rows: string[][]
  /** Separators not followed by a space: a strong CSV signal. */
  tightSeparators: number
  hasQuotedField: boolean
}

function parseDelimited(text: string, delimiter: string): ParsedDelimited | null {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let hasQuotedField = false
  let tightSeparators = 0
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')

  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index]

    if (inQuotes) {
      if (char === '"') {
        if (normalized[index + 1] === '"') {
          field += '"'
          index++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"' && field.trim() === '') {
      field = ''
      inQuotes = true
      hasQuotedField = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
      const next = normalized[index + 1]
      if (delimiter === ',' && next !== ' ' && next !== '\t') tightSeparators++
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (inQuotes) return null
  row.push(field)
  rows.push(row)

  const cleaned = rows.map((cells) => cells.map((cell) => cell.replace(/\s+/g, ' ').trim()))
  return { rows: cleaned, tightSeparators, hasQuotedField }
}

/**
 * Reads a CSV or TSV clipboard payload. The guards are deliberately
 * conservative: prose split over two lines with commas must stay prose.
 */
export function parseDelimitedTable(text: string): string[][] | null {
  if (!text.trim()) return null

  const delimiter = text.includes('\t') ? '\t' : text.includes(',') ? ',' : null
  if (!delimiter) return null

  const parsed = parseDelimited(text, delimiter)
  if (!parsed) return null

  const { rows, tightSeparators, hasQuotedField } = parsed
  if (rows.length < 2) return null

  const width = rows[0].length
  if (width < 2 || rows.some((cells) => cells.length !== width)) return null
  if (rows.some((cells) => cells.every((cell) => cell === ''))) return null

  // Comma lists written with ", " separators, or lines ending like sentences,
  // are far more likely prose than CSV.
  if (delimiter === ',' && !hasQuotedField && tightSeparators === 0) return null
  if (rows.every((cells) => /[.!?…]\s*$/.test(cells[cells.length - 1]))) return null

  return rows
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Builds the HTML the editor parses into a table; the first row is the header. */
export function tableHtmlFromRows(rows: string[][]): string {
  const [header, ...body] = rows
  const head = header.map((cell) => `<th><p>${escapeHtml(cell)}</p></th>`).join('')
  const bodyRows = body
    .map(
      (cells) => `<tr>${cells.map((cell) => `<td><p>${escapeHtml(cell)}</p></td>`).join('')}</tr>`
    )
    .join('')
  return `<table><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table>`
}

const STRIPPED_TAGS = ['script', 'style', 'meta', 'link', 'xml', 'title']

/**
 * Removes the noise that office suites and web pages put in copied HTML:
 * embedded styles, metadata, Word's `o:` namespace elements and inline styles.
 */
export function cleanPastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const tag of STRIPPED_TAGS) {
    doc.querySelectorAll(tag).forEach((element) => element.remove())
  }
  doc.body.querySelectorAll('*').forEach((element) => {
    if (element.tagName.includes(':')) {
      element.replaceWith(...Array.from(element.childNodes))
      return
    }
    element.removeAttribute('style')
    if (/^Mso/.test(element.getAttribute('class') ?? '')) element.removeAttribute('class')
  })
  return doc.body.innerHTML
}

export interface CleanPasteOptions {
  /** Directory of the open document, used to resolve pasted relative image paths. */
  getDocumentDir: () => string | null
}

/**
 * Inserts pasted Markdown as structure instead of literal characters, and
 * cleans rich HTML. Pasting stays plain inside code blocks and tables, where
 * block content would break the structure.
 */
/**
 * Inserts plain text the way a paste would: Markdown becomes structure, a
 * delimited table becomes a table, anything else is inserted as text.
 *
 * `view.pasteText` cannot be used for the structural cases: it dispatches a
 * paste event without clipboard data, so the Markdown handler never sees the
 * text.
 */
export function insertPlainText(
  editor: Editor,
  text: string,
  getDocumentDir: () => string | null
): void {
  const markdown = looksLikeMarkdown(text)
  const table = markdown ? null : parseDelimitedTable(text)
  if ((!markdown && !table) || editor.isActive('codeBlock') || editor.isActive('table')) {
    editor.view.pasteText(text)
    return
  }

  if (table) {
    editor.commands.insertContent(tableHtmlFromRows(table))
    return
  }

  const dir = getDocumentDir()
  let html = markdownToHtml(text)
  if (dir) html = resolveLocalImages(html, dir)
  editor.commands.insertContent(html)
}

export const CleanPaste = Extension.create<CleanPasteOptions>({
  name: 'cleanPaste',

  addOptions() {
    return { getDocumentDir: () => null }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-v': () => {
        void window.api.readClipboard().then((text) => {
          if (text) insertPlainText(this.editor, text, this.options.getDocumentDir)
        })
        return true
      }
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    const { getDocumentDir } = this.options

    return [
      new Plugin({
        key: new PluginKey('cleanPaste'),
        props: {
          transformPastedHTML: (html) => cleanPastedHtml(html),
          handlePaste: (_view, event) => {
            const data = event.clipboardData
            if (!data || data.getData('text/html')) return false

            const text = data.getData('text/plain')
            const markdown = looksLikeMarkdown(text)
            const table = markdown ? null : parseDelimitedTable(text)
            if (!markdown && !table) return false
            if (editor.isActive('codeBlock') || editor.isActive('table')) return false

            event.preventDefault()
            insertPlainText(editor, text, getDocumentDir)
            return true
          }
        }
      })
    ]
  }
})
