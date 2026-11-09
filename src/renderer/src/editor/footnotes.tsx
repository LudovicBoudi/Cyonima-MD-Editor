import { mergeAttributes, Node } from '@tiptap/core'
import type { Editor } from '@tiptap/react'

/**
 * Inline footnote marker. The identifier is kept as an attribute so that
 * `[^id]` can be written back exactly, even after the reference has moved.
 */
export const FootnoteReference = Node.create({
  name: 'footnoteReference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-footnote-ref') ?? '',
        renderHTML: (attributes) => ({
          'data-footnote-ref': String(attributes.id ?? '')
        })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'sup[data-footnote-ref]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, { class: 'footnote-ref' }),
      String(node.attrs.id ?? '')
    ]
  }
})

/**
 * Footnote body. Its blocks stay fully editable; the `[^id]:` label is purely
 * visual and is restored from the attribute when the document is saved.
 */
export const FootnoteDefinition = Node.create({
  name: 'footnoteDefinition',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-footnote-definition') ?? '',
        renderHTML: (attributes) => ({
          'data-footnote-definition': String(attributes.id ?? '')
        })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-footnote-definition]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'footnote-definition' }),
      0
    ]
  }
})

function nextFootnoteId(editor: Editor): string {
  const used = new Set<string>()
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'footnoteReference' || node.type.name === 'footnoteDefinition') {
      const id = String(node.attrs.id ?? '')
      if (id) used.add(id)
    }
  })

  let index = 1
  while (used.has(String(index))) index++
  return String(index)
}

/**
 * Inserts `[^n]` at the cursor and appends the matching definition at the end
 * of the document, with the caret placed inside it so the note can be typed
 * immediately.
 */
export function insertFootnote(editor: Editor): void {
  const id = nextFootnoteId(editor)
  editor
    .chain()
    .focus()
    .insertContent({ type: 'footnoteReference', attrs: { id } })
    .run()

  editor
    .chain()
    .insertContentAt(editor.state.doc.content.size, {
      type: 'footnoteDefinition',
      attrs: { id },
      content: [{ type: 'paragraph' }]
    })
    .run()

  const definition = editor.state.doc.lastChild
  if (!definition || definition.type.name !== 'footnoteDefinition') return

  const start = editor.state.doc.content.size - definition.nodeSize
  editor.chain().focus().setTextSelection(start + 2).run()
}
