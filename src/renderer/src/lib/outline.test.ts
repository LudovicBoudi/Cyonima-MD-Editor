import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensions } from '../editor/extensions'
import { markdownToHtml } from '../editor/markdown'
import { activeHeadingIndex, readOutline } from './outline'

let editor: Editor | null = null

afterEach(() => {
  editor?.destroy()
  editor = null
})

function createEditor(markdown: string): Editor {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: createExtensions({ getDocumentDir: () => null }),
    content: markdownToHtml(markdown)
  })
  return editor
}

describe('readOutline', () => {
  it('lists headings in document order with their level', () => {
    const instance = createEditor('# Introduction\n\nTexte.\n\n## Contexte\n\n### Détail\n\n## Suite\n')

    expect(readOutline(instance).map((item) => [item.level, item.text])).toEqual([
      [1, 'Introduction'],
      [2, 'Contexte'],
      [3, 'Détail'],
      [2, 'Suite']
    ])
  })

  it('points each entry at its heading node', () => {
    const instance = createEditor('Texte.\n\n## Cible\n')
    const [item] = readOutline(instance)

    expect(instance.state.doc.nodeAt(item.pos)?.type.name).toBe('heading')
    expect(instance.state.doc.nodeAt(item.pos)?.textContent).toBe('Cible')
  })

  it('returns nothing for a document without headings', () => {
    expect(readOutline(createEditor('Texte seul.\n\n- liste\n'))).toEqual([])
  })

  it('names empty headings instead of showing a blank entry', () => {
    const instance = createEditor('## \n\nTexte.\n')
    expect(readOutline(instance).map((item) => item.text)).toEqual(['Titre vide'])
  })
})

describe('activeHeadingIndex', () => {
  it('selects the last heading that has reached the reading line', () => {
    expect(activeHeadingIndex([10, 200, 400], 120)).toBe(0)
    expect(activeHeadingIndex([10, 200, 400], 300)).toBe(1)
    expect(activeHeadingIndex([10, 200, 400], 900)).toBe(2)
  })

  it('returns null above the first heading', () => {
    expect(activeHeadingIndex([200, 400], 100)).toBeNull()
    expect(activeHeadingIndex([], 100)).toBeNull()
  })
})
