import { describe, expect, it } from 'vitest'
import { findUnrepresentedInlineHtml } from './sourceMode'

describe('findUnrepresentedInlineHtml', () => {
  it('ignores Markdown the editor represents', () => {
    expect(
      findUnrepresentedInlineHtml('**gras**, <u>souligné</u>, <mark>x</mark> et [lien](https://e.x).\n')
    ).toEqual([])
  })

  it('reports inline tags that would lose their markup', () => {
    expect(findUnrepresentedInlineHtml('Eau H<sub>2</sub>O et x<sup>2</sup>.\n')).toEqual([
      'sub',
      'sup'
    ])
  })

  it('accepts coloured spans but reports plain ones', () => {
    expect(findUnrepresentedInlineHtml('<span style="color: #c0392b">rouge</span>\n')).toEqual([])
    expect(findUnrepresentedInlineHtml('<span class="x">texte</span>\n')).toEqual(['span'])
  })

  it('finds tags inside lists, quotes and tables', () => {
    const markdown = '- item <kbd>Ctrl</kbd>\n\n> <abbr>ONU</abbr>\n\n| A |\n| --- |\n| <small>x</small> |\n'
    expect(findUnrepresentedInlineHtml(markdown)).toEqual(['abbr', 'kbd', 'small'])
  })

  it('does not report block HTML, which is kept as is', () => {
    expect(findUnrepresentedInlineHtml('<div class="note">\n  <p>Bonjour</p>\n</div>\n')).toEqual([])
  })

  it('does not look inside the frontmatter', () => {
    expect(findUnrepresentedInlineHtml('---\ntitle: <sub>x</sub>\n---\n\nTexte.\n')).toEqual([])
  })
})
