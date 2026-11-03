import { describe, expect, it } from 'vitest'
import { countDocumentStats, htmlToMarkdown, markdownToHtml } from './markdown'

const SAMPLE = `# Titre

Un **gras**, *italique*, <u>souligné</u>, ~~barré~~, \`code\` et [lien](https://example.com).

- item 1
- item 2

1. un
2. deux

- [x] fait
- [ ] à faire

> citation

\`\`\`ts
const x = 1

console.log(x)
\`\`\`

| A | B |
| --- | --- |
| 1 | 2 |

---

Paragraphe final.
`

describe('markdown conversion', () => {
  it('converts Markdown to editor HTML', () => {
    const html = markdownToHtml(SAMPLE)

    expect(html).toContain('<h1>Titre</h1>')
    expect(html).toContain('<strong>gras</strong>')
    expect(html).toContain('<em>italique</em>')
    expect(html).toContain('<u>souligné</u>')
    expect(html).toContain('<del>barré</del>')
    expect(html).toContain('data-type="taskList"')
    expect(html).toContain('data-checked="true"')
    expect(html).toContain('<pre><code class="language-ts">')
    expect(html).toContain('<table>')
  })

  it('round-trips Markdown without losing structure', () => {
    const markdown = htmlToMarkdown(markdownToHtml(SAMPLE))

    expect(markdown).toContain('# Titre')
    expect(markdown).toContain('**gras**')
    expect(markdown).toContain('*italique*')
    expect(markdown).toContain('<u>souligné</u>')
    expect(markdown).toContain('~~barré~~')
    expect(markdown).toContain('[lien](https://example.com)')
    expect(markdown).toContain('- item 1\n- item 2')
    expect(markdown).toContain('1. un\n2. deux')
    expect(markdown).toContain('- [x] fait\n- [ ] à faire')
    expect(markdown).toContain('> citation')
    expect(markdown).toContain('```ts\nconst x = 1\n\nconsole.log(x)\n```')
    expect(markdown).toContain('| A | B |\n| --- | --- |\n| 1 | 2 |')
  })

  it('is stable across a second round-trip', () => {
    const once = htmlToMarkdown(markdownToHtml(SAMPLE))
    const twice = htmlToMarkdown(markdownToHtml(once))
    expect(twice).toBe(once)
  })

  it('serializes Tiptap tables as GFM tables', () => {
    const html = `<table class="md-table" style="min-width: 75px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><th><p>Fonction</p></th><th><p>Word</p></th></tr><tr><td><p>Fichier</p></td><td><p>DOCX</p></td></tr></tbody></table>`

    expect(htmlToMarkdown(html)).toBe(
      '| Fonction | Word |\n| --- | --- |\n| Fichier | DOCX |\n'
    )
  })

  it('adds an empty header when a table has none', () => {
    const html =
      '<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>'

    expect(htmlToMarkdown(html)).toBe(
      '|   |   |\n| --- | --- |\n| a | b |\n| c | d |\n'
    )
  })

  it('escapes pipes inside table cells', () => {
    const html =
      '<table><tbody><tr><th>A</th></tr><tr><td><p>un | deux</p></td></tr></tbody></table>'

    expect(htmlToMarkdown(html)).toContain('| un \\| deux |')
  })

  it('handles empty documents', () => {
    expect(markdownToHtml('   ')).toBe('')
    expect(htmlToMarkdown('<p></p>')).toBe('')
  })
})

describe('document statistics', () => {
  it('counts words and characters', () => {
    expect(countDocumentStats('Bonjour le monde')).toEqual({ words: 3, characters: 16 })
    expect(countDocumentStats('')).toEqual({ words: 0, characters: 0 })
  })
})
