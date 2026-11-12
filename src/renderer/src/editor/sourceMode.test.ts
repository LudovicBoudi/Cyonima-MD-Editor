import { describe, expect, it } from 'vitest'
import { findUnrepresentedInlineHtml, inlineHtmlWarning } from './sourceMode'

describe('findUnrepresentedInlineHtml', () => {
  it('ignores Markdown the editor represents', () => {
    expect(
      findUnrepresentedInlineHtml('**gras**, <u>souligné</u>, <mark>x</mark> et [lien](https://e.x).\n')
    ).toEqual([])
  })

  it('reports inline tags that would lose their markup', () => {
    expect(findUnrepresentedInlineHtml('Un <abbr title="x">mot</abbr> et <small>petit</small>.\n')).toEqual([
      'abbr',
      'small'
    ])
  })

  it('accepts coloured spans but reports plain ones', () => {
    expect(findUnrepresentedInlineHtml('<span style="color: #c0392b">rouge</span>\n')).toEqual([])
    expect(findUnrepresentedInlineHtml('<span class="x">texte</span>\n')).toEqual(['span'])
  })

  it('finds tags inside lists, quotes and tables', () => {
    const markdown = '- item <kbd>Ctrl</kbd>\n\n> <abbr>ONU</abbr>\n\n| A |\n| --- |\n| <small>x</small> |\n'
    expect(findUnrepresentedInlineHtml(markdown)).toEqual(['abbr', 'small'])
  })

  it('does not report block HTML, which is kept as is', () => {
    expect(findUnrepresentedInlineHtml('<div class="note">\n  <p>Bonjour</p>\n</div>\n')).toEqual([])
  })

  it('does not look inside the frontmatter', () => {
    expect(findUnrepresentedInlineHtml('---\ntitle: <sub>x</sub>\n---\n\nTexte.\n')).toEqual([])
  })

  it('does not report sub, sup and kbd, which the editor keeps', () => {
    expect(findUnrepresentedInlineHtml('H<sub>2</sub>O, x<sup>2</sup>, <kbd>Ctrl</kbd>.\n')).toEqual([])
  })
})

describe('inlineHtmlWarning', () => {
  it('returns nothing when every tag is kept', () => {
    expect(inlineHtmlWarning('H<sub>2</sub>O et **gras**.')).toBeNull()
  })

  it('warns in English when requested', () => {
    const message = inlineHtmlWarning('Un <abbr>mot</abbr>.', 'en')
    expect(message).toContain('Unsupported HTML tags')
    expect(message).toContain('<abbr>')
  })

  it('names the tags whose markup would be lost', () => {
    const message = inlineHtmlWarning('Un <abbr title="x">mot</abbr> et <span class="a">texte</span>.')

    expect(message).toContain('<abbr>, <span>')
    expect(message).toContain('perdue à l’enregistrement')
  })
})
