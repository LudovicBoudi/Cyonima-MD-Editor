import { Mark } from '@tiptap/core'

/**
 * Inline HTML that Markdown editors commonly keep (`<sub>`, `<sup>`, `<kbd>`).
 * Each one is a mark, so it survives editing and is written back as the same
 * tag, never dropped.
 */
export const Subscript = Mark.create({
  name: 'subscript',
  excludes: 'superscript',

  parseHTML() {
    return [{ tag: 'sub' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sub', HTMLAttributes, 0]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-,': () => this.editor.commands.toggleMark(this.name)
    }
  }
})

export const Superscript = Mark.create({
  name: 'superscript',
  excludes: 'subscript',

  parseHTML() {
    // Footnote references are <sup data-footnote-ref>, handled by their own node.
    return [{ tag: 'sup:not([data-footnote-ref])' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', HTMLAttributes, 0]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-.': () => this.editor.commands.toggleMark(this.name)
    }
  }
})

export const Keyboard = Mark.create({
  name: 'keyboard',

  parseHTML() {
    return [{ tag: 'kbd' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['kbd', HTMLAttributes, 0]
  }
})
