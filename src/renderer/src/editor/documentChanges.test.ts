import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensions } from './extensions'
import { isContentChange } from './documentChanges'
import { markdownToHtml } from './markdown'

let editor: Editor | null = null

afterEach(() => {
  editor?.destroy()
  editor = null
})

function openDocument(markdown: string): { changes: boolean[] } {
  const changes: boolean[] = []
  editor = new Editor({
    element: document.createElement('div'),
    extensions: createExtensions({ getDocumentDir: () => null }),
    content: markdownToHtml(markdown),
    onUpdate: ({ transaction, appendedTransactions }) => {
      changes.push(isContentChange(transaction, appendedTransactions))
    }
  })
  return { changes }
}

describe('isContentChange', () => {
  it('ignores focusing a document that ends with a footnote definition', () => {
    const { changes } = openDocument('Texte[^1].\n\n[^1]: Note.\n')
    editor?.commands.focus('start')

    expect(changes.length).toBeGreaterThan(0)
    expect(changes.every((change) => !change)).toBe(true)
  })

  it('ignores focusing a document that ends with a reference definition', () => {
    const { changes } = openDocument('Voir [oa].\n\n[oa]: https://openai.com\n')
    editor?.commands.focus('start')

    expect(changes.length).toBeGreaterThan(0)
    expect(changes.every((change) => !change)).toBe(true)
  })

  it('reports typing as a content change', () => {
    const { changes } = openDocument('Texte[^1].\n\n[^1]: Note.\n')
    editor?.commands.focus('start')
    changes.length = 0
    editor?.commands.insertContent('x')

    expect(changes).toContain(true)
  })
})
