import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensions } from './extensions'
import { insertFootnote } from './footnotes'
import { htmlToMarkdown, markdownToHtml } from './markdown'

let editor: Editor | null = null

function createEditor(markdown = ''): Editor {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: createExtensions({ getDocumentDir: () => null }),
    content: markdownToHtml(markdown)
  })
  return editor
}

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe('footnotes in the editor', () => {
  it('parses and serializes footnotes through Tiptap', () => {
    const markdown = `Texte[^1].

[^1]: Une note avec *italique*.
`
    const instance = createEditor(markdown)

    expect(instance.getHTML()).toContain('data-footnote-ref="1"')
    expect(instance.getHTML()).toContain('data-footnote-definition="1"')
    expect(htmlToMarkdown(instance.getHTML())).toBe(markdown)
  })

  it('inserts a reference and an editable definition', () => {
    const instance = createEditor('')
    instance.commands.focus('start')
    insertFootnote(instance)

    expect(instance.getHTML()).toContain('data-footnote-ref="1"')
    expect(instance.getHTML()).toContain('data-footnote-definition="1"')

    const markdown = htmlToMarkdown(instance.getHTML())
    expect(markdown).toContain('[^1]')
    expect(markdown).toContain('[^1]:')
  })

  it('numbers the next footnote without reusing an identifier', () => {
    const instance = createEditor('Texte[^1].\n\n[^1]: Note.\n')
    instance.commands.focus('end')
    insertFootnote(instance)

    expect(instance.getHTML()).toContain('data-footnote-ref="2"')
    expect(instance.getHTML()).toContain('data-footnote-definition="2"')
  })
})

describe('reference links in the editor', () => {
  it('keeps reference identifiers and forms through Tiptap', () => {
    const markdown = `Voir [OpenAI][oa] et [oa].

[oa]: https://openai.com "OpenAI"
`
    const instance = createEditor(markdown)
    const saved = htmlToMarkdown(instance.getHTML())

    expect(instance.getHTML()).toContain('data-reference-id="oa"')
    expect(instance.getHTML()).toContain('data-reference-style="full"')
    expect(saved).toBe(markdown)
  })
})
