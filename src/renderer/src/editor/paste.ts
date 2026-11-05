import { Extension } from '@tiptap/core'
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
export const CleanPaste = Extension.create<CleanPasteOptions>({
  name: 'cleanPaste',

  addOptions() {
    return { getDocumentDir: () => null }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-v': () => {
        void window.api.readClipboard().then((text) => {
          if (text) this.editor.view.pasteText(text)
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
            if (!looksLikeMarkdown(text)) return false
            if (editor.isActive('codeBlock') || editor.isActive('table')) return false

            event.preventDefault()
            const dir = getDocumentDir()
            let html = markdownToHtml(text)
            if (dir) html = resolveLocalImages(html, dir)
            editor.commands.insertContent(html)
            return true
          }
        }
      })
    ]
  }
})
