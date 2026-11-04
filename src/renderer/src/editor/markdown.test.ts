import { describe, expect, it } from 'vitest'
import {
  countDocumentStats,
  htmlToMarkdown,
  joinFrontmatter,
  markdownToHtml,
  splitFrontmatter
} from './markdown'

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

describe('frontmatter', () => {
  const BLOCK = '---\ntitle: "Mon document"\ntags:\n  - a\n  - b\n---'
  const BODY = '# Titre\n\nCorps.\n'
  const DOCUMENT = `${BLOCK}\n\n${BODY}`

  it('extracts the block without touching the body', () => {
    expect(splitFrontmatter(DOCUMENT)).toEqual({ frontmatter: BLOCK, body: BODY })
  })

  it('round-trips the full document without altering the block', () => {
    const parts = splitFrontmatter(DOCUMENT)
    const markdown = joinFrontmatter(parts.frontmatter, htmlToMarkdown(markdownToHtml(parts.body)))

    expect(markdown).toBe(DOCUMENT)
    expect(markdown.startsWith(BLOCK)).toBe(true)
  })

  it('preserves an empty frontmatter block', () => {
    expect(splitFrontmatter('---\n---\n')).toEqual({ frontmatter: '---\n---', body: '' })
    expect(joinFrontmatter('---\n---', '')).toBe('---\n---\n')
  })

  it('accepts the YAML `...` closing delimiter', () => {
    const document = '---\ntitle: Test\n...\n\nParagraphe.\n'
    expect(splitFrontmatter(document)).toEqual({
      frontmatter: '---\ntitle: Test\n...',
      body: 'Paragraphe.\n'
    })
  })

  it('does not mistake a horizontal rule for frontmatter', () => {
    const document = '# Titre\n\n---\n\nSuite\n'
    expect(splitFrontmatter(document)).toEqual({ frontmatter: null, body: document })
  })

  it('keeps CRLF line endings inside the block', () => {
    const parts = splitFrontmatter('---\r\ntitle: Test\r\n---\r\n\r\nCorps.\r\n')
    expect(parts.frontmatter).toBe('---\r\ntitle: Test\r\n---')
    expect(parts.body).toBe('Corps.\r\n')
  })

  it('preserves a leading BOM with the block', () => {
    const parts = splitFrontmatter('\uFEFF---\ntitle: Test\n---\nCorps.\n')
    expect(parts.frontmatter).toBe('\uFEFF---\ntitle: Test\n---')
  })

  it('leaves documents without frontmatter unchanged', () => {
    const document = '# Titre\n\nCorps.\n'
    expect(splitFrontmatter(document)).toEqual({ frontmatter: null, body: document })
    expect(joinFrontmatter(null, document)).toBe(document)
  })

  it('does not create extra blank lines when joining', () => {
    expect(joinFrontmatter(BLOCK, '\n\n# Titre\n')).toBe(`${BLOCK}\n\n# Titre\n`)
    expect(joinFrontmatter(BLOCK, '')).toBe(`${BLOCK}\n`)
  })
})

describe('raw HTML blocks', () => {
  const BLOCK = '<div class="note">\n  <p>Bonjour</p>\n</div>'
  const DOCUMENT = `# Avant\n\n${BLOCK}\n\nAprès.\n`

  it('turns top-level raw HTML into an opaque placeholder', () => {
    const html = markdownToHtml(DOCUMENT)

    expect(html).toContain('data-raw-html=')
    expect(html).not.toContain('<div class="note">')
    expect(html).toContain('<h1>Avant</h1>')
  })

  it('restores the block verbatim on save', () => {
    const markdown = htmlToMarkdown(markdownToHtml(DOCUMENT))

    expect(markdown).toContain(BLOCK)
    expect(markdown).toContain('# Avant')
    expect(markdown).toContain('Après.')
  })

  it('is stable across two round-trips', () => {
    const once = htmlToMarkdown(markdownToHtml(DOCUMENT))
    const twice = htmlToMarkdown(markdownToHtml(once))

    expect(twice).toBe(once)
  })

  it('never injects dangerous markup into the editor HTML', () => {
    const html = markdownToHtml('<script>alert("x")</script>\n\nTexte.\n')

    expect(html).not.toContain('<script>')
    expect(html).toContain('data-raw-html=')
  })

  it('preserves the dangerous block on save', () => {
    const markdown = htmlToMarkdown(markdownToHtml('<script>alert("x")</script>\n\nTexte.\n'))

    expect(markdown).toContain('<script>alert("x")</script>')
  })

  it('supports several raw blocks', () => {
    const document =
      '<iframe src="https://example.com"></iframe>\n\nMilieu\n\n<style>.x { color: red }</style>\n'
    const markdown = htmlToMarkdown(markdownToHtml(document))

    expect(markdown).toContain('<iframe src="https://example.com"></iframe>')
    expect(markdown).toContain('<style>.x { color: red }</style>')
    expect(markdown).toContain('Milieu')
  })

  it('handles accents and percent signs in raw blocks', () => {
    const block = '<div title="100 % — café">\n  <span>Été</span>\n</div>'
    const markdown = htmlToMarkdown(markdownToHtml(`${block}\n\nSuite.\n`))

    expect(markdown).toContain(block)
  })
})

describe('document statistics', () => {
  it('counts words and characters', () => {
    expect(countDocumentStats('Bonjour le monde')).toEqual({ words: 3, characters: 16 })
    expect(countDocumentStats('')).toEqual({ words: 0, characters: 0 })
  })
})
