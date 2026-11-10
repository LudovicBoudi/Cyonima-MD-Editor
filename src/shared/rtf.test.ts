import { describe, expect, it } from 'vitest'
import { looksLikeRtf, rtfToHtml } from './rtf'

describe('looksLikeRtf', () => {
  it('recognises an RTF payload', () => {
    expect(looksLikeRtf('{\\rtf1\\ansi Bonjour}')).toBe(true)
    expect(looksLikeRtf('\r\n  {\\rtf1\\ansi Bonjour}')).toBe(true)
  })

  it('rejects plain text and Markdown', () => {
    expect(looksLikeRtf('Bonjour')).toBe(false)
    expect(looksLikeRtf('# Titre')).toBe(false)
    expect(looksLikeRtf('{ pas du RTF }')).toBe(false)
  })
})

describe('rtfToHtml', () => {
  it('turns paragraphs into paragraph elements', () => {
    expect(rtfToHtml('{\\rtf1\\ansi Premier\\par Deuxième\\par}')).toBe(
      '<p>Premier</p><p>Deuxième</p>'
    )
  })

  it('keeps bold, italic, underline and strike', () => {
    expect(
      rtfToHtml(
        '{\\rtf1{\\b Gras} {\\i italique} {\\ul souligné} {\\strike barré}\\par}'
      )
    ).toBe('<p><strong>Gras</strong> <em>italique</em> <u>souligné</u> <s>barré</s></p>')
  })

  it('restores formatting at the end of a group', () => {
    expect(rtfToHtml('{\\rtf1\\b gras{\\i deux}gras\\par}')).toBe(
      '<p><strong>gras<em>deux</em>gras</strong></p>'
    )
  })

  it('decodes hexadecimal and Unicode escapes', () => {
    expect(rtfToHtml("{\\rtf1 caf\\'e9 et \\u233?\\par}")).toBe('<p>café et é</p>')
  })

  it('skips font tables and hyperlink instructions', () => {
    const rtf =
      '{\\rtf1{\\fonttbl{\\f0 Arial;}}' +
      '{\\field{\\*\\fldinst{HYPERLINK "https://example.org"}}{\\fldrslt Lien}}\\par}'
    expect(rtfToHtml(rtf)).toBe('<p>Lien</p>')
  })

  it('keeps line breaks and tabs', () => {
    expect(rtfToHtml('{\\rtf1 a\\line b\\tab c\\par}')).toBe('<p>a<br>b\tc</p>')
  })

  it('escapes HTML found in the document text', () => {
    expect(rtfToHtml('{\\rtf1 1 < 2 & 3 > 2\\par}')).toBe('<p>1 &lt; 2 &amp; 3 &gt; 2</p>')
  })

  it('closes formatting left open at the end of the document', () => {
    expect(rtfToHtml('{\\rtf1\\b gras}')).toBe('<p><strong>gras</strong></p>')
  })

  it('returns an empty string when there is no text', () => {
    expect(rtfToHtml('{\\rtf1\\ansi\\par\\par}')).toBe('')
  })
})
