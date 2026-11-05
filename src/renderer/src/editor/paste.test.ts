import { describe, expect, it } from 'vitest'
import { cleanPastedHtml, looksLikeMarkdown } from './paste'

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
