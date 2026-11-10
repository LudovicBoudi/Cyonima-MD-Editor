import { describe, expect, it } from 'vitest'
import {
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

  it('preserves known, unknown and missing fence languages', () => {
    const markdown = '```haskell\nmain = putStrLn "salut"\n```\n\n```\ntexte brut\n```\n'
    const html = markdownToHtml(markdown)

    expect(html).toContain('<code class="language-haskell">')
    expect(htmlToMarkdown(html)).toBe(markdown)
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

  it('keeps escaped pipes readable when the Markdown is loaded', () => {
    const html = markdownToHtml('| A | B |\n| --- | --- |\n| un \\| deux | trois |\n')

    expect(html).toContain('un | deux')
    expect(html).not.toContain('\\|')
  })

  it('round-trips empty table cells', () => {
    const markdown = '| A | B | C |\n| --- | --- | --- |\n| un |  | trois |\n|  | deux |  |\n'

    expect(htmlToMarkdown(markdownToHtml(markdown))).toBe(markdown)
  })

  it('writes column alignment from the header cells', () => {
    const html = `<table><thead><tr><th style="text-align: left">G</th><th style="text-align: center">C</th><th style="text-align: right">D</th></tr></thead><tbody><tr><td>a</td><td>b</td><td>c</td></tr></tbody></table>`

    expect(htmlToMarkdown(html)).toBe('| G | C | D |\n| :--- | :---: | ---: |\n| a | b | c |\n')
  })

  it('writes column alignment from the legacy align attribute', () => {
    const html =
      '<table><thead><tr><th align="center">Titre</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table>'

    expect(htmlToMarkdown(html)).toBe('| Titre |\n| :---: |\n| x |\n')
  })

  it('falls back to a body cell when the header has no alignment', () => {
    const html =
      '<table><thead><tr><th>Titre</th></tr></thead><tbody><tr><td style="text-align: right">x</td></tr></tbody></table>'

    expect(htmlToMarkdown(html)).toBe('| Titre |\n| ---: |\n| x |\n')
  })

  it('reads Markdown column alignment and keeps it across round-trips', () => {
    const markdown = '| G | C | D |\n| :--- | :---: | ---: |\n| a | b | c |\n'

    expect(markdownToHtml(markdown)).toContain('<th align="center">C</th>')
    expect(htmlToMarkdown(markdownToHtml(markdown))).toBe(markdown)
  })

  it('handles empty documents', () => {
    expect(markdownToHtml('   ')).toBe('')
    expect(htmlToMarkdown('<p></p>')).toBe('')
  })
})

describe('footnotes', () => {
  const DOCUMENT = `Texte avec une note[^1] et une autre[^long].

[^1]: Première note.

[^long]: Note plus longue
    sur deux lignes.
`

  it('renders references as markers and definitions as editable blocks', () => {
    const html = markdownToHtml(DOCUMENT)

    expect(html).toContain('<sup data-footnote-ref="1">1</sup>')
    expect(html).toContain('<sup data-footnote-ref="long">long</sup>')
    expect(html).toContain('data-footnote-definition="1"')
    expect(html).toContain('<p>Première note.</p>')
    expect(html).toContain('<p>Note plus longue\nsur deux lignes.</p>')
  })

  it('round-trips footnote references and definitions', () => {
    const once = htmlToMarkdown(markdownToHtml(DOCUMENT))

    // Soft line breaks are normalized by Turndown, like in normal paragraphs.
    expect(once).toBe(
      DOCUMENT.replace('Note plus longue\n    sur deux lignes.', 'Note plus longue sur deux lignes.')
    )
    expect(htmlToMarkdown(markdownToHtml(once))).toBe(once)
  })

  it('keeps a reference definition that follows a footnote', () => {
    const saved = 'Une note[^1] et [OpenAI][oa].\n\n[^1]: Première note.\n\n[oa]: https://openai.com "OpenAI"\n'
    const html = markdownToHtml(saved)

    expect(html).toContain('data-reference-id="oa"')
    expect(htmlToMarkdown(html)).toBe(saved)
  })

  it('keeps multi-paragraph definitions', () => {
    const markdown = `Texte[^a].

[^a]: Premier paragraphe.

    Second paragraphe avec **gras**.
`

    expect(htmlToMarkdown(markdownToHtml(markdown))).toBe(markdown)
  })

  it('keeps Markdown formatting inside a definition', () => {
    const html = markdownToHtml('[^1]: Une note avec *italique*.\n')
    expect(html).toContain('<em>italique</em>')
    expect(htmlToMarkdown(html)).toBe('[^1]: Une note avec *italique*.\n')
  })

  it('does not turn a bracketed number into a footnote', () => {
    expect(markdownToHtml('Un tableau [1] ordinaire.\n')).toContain('Un tableau [1] ordinaire.')
  })
})

describe('link reference definitions', () => {
  const DOCUMENT = `Voir [OpenAI][oa], [le site][site] et [site].

[oa]: https://openai.com "OpenAI"

[site]: https://example.com
`

  it('keeps the identifier and the reference form', () => {
    const html = markdownToHtml(DOCUMENT)

    expect(html).toContain('data-reference-id="oa" data-reference-style="full"')
    expect(html).toContain('data-reference-id="site" data-reference-style="full"')
    expect(html).toContain('data-reference-id="site" data-reference-style="shortcut"')
    expect(html).toContain('data-reference-definition="oa"')
  })

  it('round-trips definitions and links', () => {
    expect(htmlToMarkdown(markdownToHtml(DOCUMENT))).toBe(DOCUMENT)
  })

  it('keeps unused definitions', () => {
    const markdown = 'Texte.\n\n[inutilisée]: https://example.com\n'
    expect(htmlToMarkdown(markdownToHtml(markdown))).toBe(markdown)
  })

  it('ignores definition-like lines inside fenced code', () => {
    const markdown = '```md\n[oa]: https://faux.example\n```\n\nTexte [oa].\n'
    const html = markdownToHtml(markdown)

    expect(html).not.toContain('data-reference-id="oa"')
    const saved = htmlToMarkdown(html)
    expect(saved).toContain('```md\n[oa]: https://faux.example\n```')
    expect(saved).toContain('Texte \\[oa\\].')
  })

  it('falls back to an inline link when the definition is gone', () => {
    const html =
      '<p><a href="https://example.com" title="Titre" data-reference-id="oa" data-reference-style="full">texte</a></p>'

    expect(htmlToMarkdown(html)).toBe('[texte](https://example.com "Titre")\n')
  })

  it('supports collapsed and case-insensitive labels', () => {
    const markdown = 'Voir [oa][] et [OA].\n\n[oa]: https://example.com\n'
    const html = markdownToHtml(markdown)

    expect(html).toContain('data-reference-style="collapsed"')
    expect(html).toContain('data-reference-style="shortcut"')
    expect(htmlToMarkdown(html)).toBe(markdown)
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

describe('paragraph alignment', () => {
  it('reads an aligned paragraph as an editable block', () => {
    const html = markdownToHtml('<p align="center">**Gras** centré</p>\n')
    expect(html).toContain('<p style="text-align: center"><strong>Gras</strong> centré</p>')
  })

  it('reads aligned headings', () => {
    expect(markdownToHtml('<h2 align="right">Titre</h2>\n')).toContain(
      '<h2 style="text-align: right">Titre</h2>'
    )
  })

  it('applies the alignment to each paragraph of a multi-block element', () => {
    const html = markdownToHtml('<p align="center">\n\n**un**\n\ndeux\n\n</p>\n')
    expect(html).toContain('<p style="text-align: center"><strong>un</strong></p>')
    expect(html).toContain('<p style="text-align: center">deux</p>')
    expect(html).not.toMatch(/<p[^>]*>\s*<p/)
  })

  it('writes centred and right alignment as an HTML paragraph with Markdown inside', () => {
    const markdown = htmlToMarkdown('<p style="text-align: center">Texte <strong>gras</strong></p>')
    expect(markdown).toBe('<p align="center">Texte **gras**</p>\n')
  })

  it('writes aligned headings as HTML', () => {
    expect(htmlToMarkdown('<h1 style="text-align: right">Titre</h1>')).toBe(
      '<h1 align="right">Titre</h1>\n'
    )
  })

  it('does not write left alignment, which is the default', () => {
    expect(htmlToMarkdown('<p style="text-align: left">Texte</p>')).toBe('Texte\n')
  })

  it('keeps aligned paragraphs stable across round-trips', () => {
    const once = htmlToMarkdown(markdownToHtml('<p align="right">**a** et *b*</p>\n\nSuite.\n'))
    const twice = htmlToMarkdown(markdownToHtml(once))
    expect(once).toContain('<p align="right">**a** et *b*</p>')
    expect(twice).toBe(once)
  })

  it('writes sub, sup and kbd back as the same inline tags', () => {
    const markdown = 'Eau H<sub>2</sub>O, x<sup>2</sup> et <kbd>Ctrl</kbd>+<kbd>S</kbd>.\n'

    expect(htmlToMarkdown(markdownToHtml(markdown))).toBe(markdown)
  })
})
