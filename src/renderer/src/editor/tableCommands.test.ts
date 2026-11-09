import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { afterEach, describe, expect, it } from 'vitest'
import { htmlToMarkdown } from './markdown'
import {
  isTableHeaderEnabled,
  setColumnAlignment,
  toggleTableHeader
} from './tableCommands'

let editor: Editor | null = null

function createEditor(content: string): Editor {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, TableKit.configure({ table: { resizable: false } })],
    content
  })
  return editor
}

function selectText(instance: Editor, text: string): void {
  let position: number | null = null
  instance.state.doc.descendants((node, pos) => {
    if (position === null && node.isText && node.text === text) position = pos
  })
  if (position === null) throw new Error(`Text "${text}" not found`)
  instance.commands.setTextSelection(position + 1)
}

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe('setColumnAlignment', () => {
  it('aligns every cell of the column under the selection', () => {
    const instance = createEditor(
      '<table><tbody><tr><th><p>G</p></th><th><p>C</p></th><th><p>D</p></th></tr>' +
        '<tr><td><p>a</p></td><td><p>b</p></td><td><p>c</p></td></tr></tbody></table>'
    )

    selectText(instance, 'b')
    expect(setColumnAlignment(instance, 'center')).toBe(true)

    expect(htmlToMarkdown(instance.getHTML())).toBe(
      '| G | C | D |\n| --- | :---: | --- |\n| a | b | c |\n'
    )
  })

  it('changes the alignment of an already aligned column', () => {
    const instance = createEditor(
      '<table><tbody><tr><th style="text-align: center"><p>Titre</p></th></tr>' +
        '<tr><td style="text-align: center"><p>x</p></td></tr></tbody></table>'
    )

    selectText(instance, 'x')
    expect(setColumnAlignment(instance, 'right')).toBe(true)

    expect(htmlToMarkdown(instance.getHTML())).toBe('| Titre |\n| ---: |\n| x |\n')
  })

  it('does nothing outside a table', () => {
    const instance = createEditor('<p>Texte</p>')
    selectText(instance, 'Texte')

    expect(setColumnAlignment(instance, 'center')).toBe(false)
  })
})

describe('toggleTableHeader', () => {
  it('disables the header by moving its content into the body under a blank header', () => {
    const instance = createEditor(
      '<table><tbody><tr><th><p>H</p></th></tr><tr><td><p>a</p></td></tr></tbody></table>'
    )
    selectText(instance, 'H')
    expect(isTableHeaderEnabled(instance)).toBe(true)

    expect(toggleTableHeader(instance)).toBe(true)

    expect(isTableHeaderEnabled(instance)).toBe(false)
    expect(htmlToMarkdown(instance.getHTML())).toBe('|  |\n| --- |\n| H |\n| a |\n')
  })

  it('enables the header again by promoting the first data row', () => {
    const instance = createEditor(
      '<table><tbody><tr><th><p>H</p></th></tr><tr><td><p>a</p></td></tr></tbody></table>'
    )
    selectText(instance, 'H')
    toggleTableHeader(instance)
    selectText(instance, 'H')

    expect(toggleTableHeader(instance)).toBe(true)

    expect(isTableHeaderEnabled(instance)).toBe(true)
    expect(htmlToMarkdown(instance.getHTML())).toBe('| H |\n| --- |\n| a |\n')
  })

  it('removes a blank header row when enabling the header', () => {
    const instance = createEditor(
      '<table><tbody><tr><th><p></p></th></tr><tr><td><p>a</p></td></tr></tbody></table>'
    )
    expect(isTableHeaderEnabled(instance)).toBe(false)

    selectText(instance, 'a')
    expect(toggleTableHeader(instance)).toBe(true)

    expect(htmlToMarkdown(instance.getHTML())).toBe('| a |\n| --- |\n')
  })

  it('leaves a table with only a blank header untouched', () => {
    const instance = createEditor('<table><tbody><tr><th><p></p></th></tr></tbody></table>')
    expect(toggleTableHeader(instance)).toBe(false)
  })
})
