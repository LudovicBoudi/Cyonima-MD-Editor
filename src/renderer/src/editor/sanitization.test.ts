import { describe, expect, it } from 'vitest'
import { htmlToMarkdown } from './markdown'
import { markdownToHtml } from './markdown'

describe('HTML sanitization', () => {
  it('removes dangerous tags and event handlers before the editor sees them', () => {
    const html = markdownToHtml(
      'Texte <a href="javascript:alert(1)" onclick="alert(2)">lien</a> et ' +
        '<img src="x" onerror="alert(3)"> fin\n'
    )

    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('onerror')
  })

  it('keeps raw HTML blocks opaque and escaped', () => {
    const html = markdownToHtml(
      '<div onclick="alert(1)">\n  <script>alert(2)</script>\n</div>\n\nTexte.\n'
    )

    expect(html).not.toContain('<script>')
    expect(html).not.toContain('onclick=')
    expect(html).toContain('data-raw-html=')
    expect(html).toContain('Texte.')
  })

  it('preserves the opaque block when saving, without executing it', () => {
    const markdown = '<div onclick="alert(1)">\n  <script>alert(2)</script>\n</div>'
    expect(htmlToMarkdown(markdownToHtml(markdown))).toContain(markdown)
  })
})
