import { Editor } from '@tiptap/core'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createExtensions } from './extensions'
import {
  cleanPastedHtml,
  insertPlainText,
  looksLikeHtml,
  looksLikeMarkdown,
  parseDelimitedTable,
  tableHtmlFromRows
} from './paste'

describe('looksLikeMarkdown', () => {
  it('detects block structure', () => {
    expect(looksLikeMarkdown('# Titre\n\nTexte')).toBe(true)
    expect(looksLikeMarkdown('Intro\n- un\n- deux')).toBe(true)
    expect(looksLikeMarkdown('1. premier\n2. second')).toBe(true)
    expect(looksLikeMarkdown('- [ ] à faire')).toBe(true)
    expect(looksLikeMarkdown('> citation')).toBe(true)
    expect(looksLikeMarkdown('```js\nconst x = 1\n```')).toBe(true)
    expect(looksLikeMarkdown('avant\n\n---\n\naprès')).toBe(true)
    expect(looksLikeMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |')).toBe(true)
  })

  it('leaves plain prose alone, even with inline markers', () => {
    expect(looksLikeMarkdown('Une phrase simple.')).toBe(false)
    expect(looksLikeMarkdown('Deux lignes\nsans structure.')).toBe(false)
    expect(looksLikeMarkdown('5 * 3 * 2 = 30')).toBe(false)
    expect(looksLikeMarkdown('Voir **ceci** et [cela](https://x.y).')).toBe(false)
    expect(looksLikeMarkdown('a | b | c')).toBe(false)
  })

  it('does not mistake a leading dash for a list without a space', () => {
    expect(looksLikeMarkdown('-10 degrés')).toBe(false)
  })
})

describe('looksLikeHtml', () => {
  it('recognises HTML fragments and complete documents', () => {
    expect(looksLikeHtml('<h1>Titre</h1><p>Texte</p>')).toBe(true)
    expect(looksLikeHtml('<!doctype html><html><body>Texte</body></html>')).toBe(true)
    expect(looksLikeHtml('  <ul><li>un</li></ul>')).toBe(true)
  })

  it('leaves prose with angle brackets alone', () => {
    expect(looksLikeHtml('a < b et c > d')).toBe(false)
    expect(looksLikeHtml('Utiliser <div> pour un bloc')).toBe(false)
    expect(looksLikeHtml('# Titre')).toBe(false)
  })
})

describe('cleanPastedHtml', () => {
  it('removes styles, metadata and Word namespace elements', () => {
    const html =
      '<html><head><meta charset="utf-8"><style>p { color: red }</style><title>x</title></head>' +
      '<body><p class="MsoNormal" style="margin:0cm">Bonjour<o:p></o:p></p></body></html>'
    const cleaned = cleanPastedHtml(html)

    expect(cleaned).not.toContain('<style')
    expect(cleaned).not.toContain('<meta')
    expect(cleaned).not.toContain('style=')
    expect(cleaned).not.toContain('class="Mso')
    expect(cleaned).not.toMatch(/o:p/i)
    expect(cleaned).toContain('Bonjour')
  })

  it('keeps structure and ordinary classes', () => {
    const cleaned = cleanPastedHtml('<ul><li><strong>un</strong></li></ul><code class="language-js">x</code>')

    expect(cleaned).toContain('<ul><li><strong>un</strong></li></ul>')
    expect(cleaned).toContain('class="language-js"')
  })
})

describe('parseDelimitedTable', () => {
  it('reads tab-separated data', () => {
    expect(parseDelimitedTable('Nom\tÂge\nAlice\t30\nBob\t25')).toEqual([
      ['Nom', 'Âge'],
      ['Alice', '30'],
      ['Bob', '25']
    ])
  })

  it('reads a three-column CSV with tight separators', () => {
    expect(parseDelimitedTable('Nom,Âge,Ville\nAlice,30,Paris\nBob,25,Lyon')).toEqual([
      ['Nom', 'Âge', 'Ville'],
      ['Alice', '30', 'Paris'],
      ['Bob', '25', 'Lyon']
    ])
  })

  it('reads a two-column CSV when separators are not followed by a space', () => {
    expect(parseDelimitedTable('Nom,Âge\nAlice,30')).toEqual([
      ['Nom', 'Âge'],
      ['Alice', '30']
    ])
  })

  it('supports quoted fields, escaped quotes and commas', () => {
    expect(parseDelimitedTable('Nom,Remarque\n"Dupont, Jean","Il a dit ""bonjour"""')).toEqual([
      ['Nom', 'Remarque'],
      ['Dupont, Jean', 'Il a dit "bonjour"']
    ])
    expect(parseDelimitedTable('Nom, Remarque\nDupont, "Jean, fils"')).toEqual([
      ['Nom', 'Remarque'],
      ['Dupont', 'Jean, fils']
    ])
  })

  it('collapses newlines inside quoted fields', () => {
    expect(parseDelimitedTable('A,B\n"un\ndeux",trois')).toEqual([
      ['A', 'B'],
      ['un deux', 'trois']
    ])
  })

  it('keeps empty cells', () => {
    expect(parseDelimitedTable('A\tB\tC\n1\t\t3')).toEqual([
      ['A', 'B', 'C'],
      ['1', '', '3']
    ])
  })

  it('does not turn prose with commas into a table', () => {
    expect(parseDelimitedTable('Bonjour, monde\nSalut, toi')).toBeNull()
    expect(parseDelimitedTable('Bonjour, comment, allez-vous ?\nSalut, ça, va ?')).toBeNull()
  })

  it('rejects inconsistent rows and single rows', () => {
    expect(parseDelimitedTable('A,B,C\n1,2')).toBeNull()
    expect(parseDelimitedTable('A,B,C')).toBeNull()
    expect(parseDelimitedTable('')).toBeNull()
  })
})

describe('tableHtmlFromRows', () => {
  it('uses the first row as the header and escapes HTML', () => {
    expect(tableHtmlFromRows([['A', '<B>'], ['1 & 2', '"x"']])).toBe(
      '<table><thead><tr><th><p>A</p></th><th><p>&lt;B&gt;</p></th></tr></thead>' +
        '<tbody><tr><td><p>1 &amp; 2</p></td><td><p>&quot;x&quot;</p></td></tr></tbody></table>'
    )
  })
})

describe('insertPlainText', () => {
  let editor: Editor | null = null

  beforeAll(() => {
    // jsdom has no ClipboardEvent, which ProseMirror needs for plain-text paste.
    if (!('ClipboardEvent' in globalThis)) {
      Object.assign(globalThis, { ClipboardEvent: class extends Event {} })
    }
  })

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  function createEditor(): Editor {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: createExtensions({ getDocumentDir: () => null }),
      content: '<p>Début</p>'
    })
    editor.commands.focus('end')
    return editor
  }

  it('turns pasted Markdown into structure at the cursor', () => {
    const instance = createEditor()
    insertPlainText(instance, '## Section\n\n- premier\n- second', () => null)

    expect(instance.getHTML()).toContain('<h2>Section</h2>')
    expect(instance.getHTML()).toContain('<li>')
  })

  it('inserts plain prose without changing it', () => {
    const instance = createEditor()
    insertPlainText(instance, '9 novembre 2026', () => null)

    expect(instance.getText()).toContain('Début9 novembre 2026')
  })

  it('converts HTML source into structure', () => {
    const instance = createEditor()
    insertPlainText(instance, '<h2>Section</h2><p><strong>Texte</strong> importé</p>', () => null)

    expect(instance.getHTML()).toContain('<h2>Section</h2>')
    expect(instance.getHTML()).toContain('<strong>Texte</strong>')
    expect(instance.getHTML()).not.toContain('&lt;h2')
  })

  it('converts RTF source into paragraphs and formatting', () => {
    const instance = createEditor()
    insertPlainText(
      instance,
      '{\\rtf1\\ansi Premier\\par {\\b Gras} et {\\i italique}\\par}',
      () => null
    )

    expect(instance.getHTML()).toContain('<p>Premier</p>')
    expect(instance.getHTML()).toContain('<strong>Gras</strong>')
    expect(instance.getHTML()).toContain('<em>italique</em>')
    expect(instance.getHTML()).not.toContain('rtf1')
  })
})
