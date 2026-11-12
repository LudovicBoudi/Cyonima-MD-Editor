import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { common, createLowlight } from 'lowlight'
import { CleanPaste } from './paste'
import type { CleanPasteOptions } from './paste'
import { FootnoteDefinition, FootnoteReference } from './footnotes'
import { CustomImage } from './image'
import { RawHtml } from './RawHtml'
import { ReferenceLink } from './referenceLink'
import { ReferenceDefinition } from './references'
import { SearchHighlight } from './searchHighlight'
import { Keyboard, Subscript, Superscript } from './inlineHtmlMarks'

const lowlight = createLowlight(common)

/**
 * Tiptap falls back to automatic language detection when a fence has no
 * language or uses one that is not registered. Showing a block as another
 * language would be misleading, so unlabelled/unknown blocks stay plain.
 */
lowlight.highlightAuto = (value: string) => lowlight.highlight('plaintext', value)

export interface ExtensionOptions extends CleanPasteOptions {
  /** Translated placeholder, read each time it is displayed. */
  getPlaceholder?: () => string
}

const DEFAULT_PLACEHOLDER = 'Commencez à écrire… Tapez « # » pour un titre, « - » pour une liste.'

export function createExtensions({ getPlaceholder, ...paste }: ExtensionOptions) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      codeBlock: false,
      link: false
    }),
    ReferenceLink.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: { rel: 'noopener noreferrer nofollow' }
    }),
    CodeBlockLowlight.configure({
      lowlight,
      HTMLAttributes: { class: 'code-block', spellcheck: 'false' }
    }),
    Placeholder.configure({
      placeholder: () => getPlaceholder?.() ?? DEFAULT_PLACEHOLDER
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    CustomImage.configure({ inline: false, allowBase64: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    FootnoteReference,
    FootnoteDefinition,
    ReferenceDefinition,
    RawHtml,
    Subscript,
    Superscript,
    Keyboard,
    SearchHighlight,
    CleanPaste.configure(paste),
    TableKit.configure({
      table: { resizable: false, HTMLAttributes: { class: 'md-table' } }
    })
  ]
}
