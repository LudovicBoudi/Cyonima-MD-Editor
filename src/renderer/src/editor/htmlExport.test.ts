import { describe, expect, it } from 'vitest'
import { DEFAULT_TYPOGRAPHY } from '../../../shared/typography'
import type { TypographySettings } from '../../../shared/types'
import { buildStandaloneHtml, frontmatterTitle } from './htmlExport'

const TYPOGRAPHY: TypographySettings = {
  ...DEFAULT_TYPOGRAPHY,
  fontFamily: 'sans',
  fontSize: 19,
  lineHeight: 1.8,
  paragraphSpacing: 1.2
}

function build(markdown: string, documentDir: string | null = '/docs/project'): string {
  return buildStandaloneHtml({
    markdown,
    fileName: 'notes.md',
    typography: TYPOGRAPHY,
    documentDir
  })
}

describe('frontmatterTitle', () => {
  it('reads a simple title and strips matching quotes', () => {
    expect(frontmatterTitle('---\ntitle: "Mon titre"\nauthor: Cyonima\n---')).toBe('Mon titre')
    expect(frontmatterTitle("---\ntitle: 'Autre titre'\n---")).toBe('Autre titre')
  })

  it('ignores missing or empty titles', () => {
    expect(frontmatterTitle(null)).toBeNull()
    expect(frontmatterTitle('---\nauthor: Cyonima\n---')).toBeNull()
    expect(frontmatterTitle('---\ntitle:   \n---')).toBeNull()
  })

  it('reads literal and folded block titles', () => {
    expect(frontmatterTitle('---\ntitle: |\n  Rapport\n  annuel\n---')).toBe('Rapport\nannuel')
    expect(frontmatterTitle('---\ntitle: >\n  Rapport\n  annuel\n---')).toBe('Rapport annuel')
  })
})

describe('buildStandaloneHtml', () => {
  it('writes the requested document language', () => {
    const html = buildStandaloneHtml({
      markdown: '# Hello',
      fileName: 'notes.md',
      typography: TYPOGRAPHY,
      documentDir: null,
      language: 'en'
    })
    expect(html).toContain('<html lang="en">')
  })

  it('produces a complete document with embedded styles and the typography', () => {
    const html = build('# Bonjour\n\nUn paragraphe.')

    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('<html lang="fr">')
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('<title>notes</title>')
    expect(html).toContain('<style>')
    expect(html).toContain('--doc-font-size: 19px')
    expect(html).toContain('--doc-line-height: 1.8')
    expect(html).toContain('--doc-paragraph-spacing: 1.2em')
    expect(html).toContain('<main class="document">')
    expect(html).toContain('<h1>Bonjour</h1>')
    expect(html).toContain('Un paragraphe.')
  })

  it('uses the frontmatter title and excludes the frontmatter from the body', () => {
    const html = build('---\ntitle: "Rapport annuel"\nauthor: Cyonima\n---\n\n# Contenu')

    expect(html).toContain('<title>Rapport annuel</title>')
    expect(html).not.toContain('author: Cyonima')
    expect(html).not.toContain('---')
    expect(html).toContain('<h1>Contenu</h1>')
  })

  it('escapes the title', () => {
    const html = buildStandaloneHtml({
      markdown: '',
      fileName: 'a < b & "c".md',
      typography: DEFAULT_TYPOGRAPHY,
      documentDir: null
    })
    expect(html).toContain('<title>a &lt; b &amp; &quot;c&quot;</title>')
  })

  it('turns footnotes into anchors and removes reference placeholders', () => {
    const markdown = `Une note[^1] et un [lien][ref].

[^1]: Le texte de la note.

[ref]: https://example.com "Exemple"
`
    const html = build(markdown)

    expect(html).toContain('<sup class="footnote-ref" id="fnref-1"><a href="#fn-1">1</a></sup>')
    expect(html).toContain('<div class="footnote" id="fn-1">')
    expect(html).toContain('<span class="footnote-label">[1]</span>')
    expect(html).toContain('Le texte de la note.')
    expect(html).not.toContain('data-footnote-ref')
    expect(html).not.toContain('data-footnote-definition')
    expect(html).not.toContain('data-reference-definition')
    expect(html).toContain('href="https://example.com"')
  })

  it('renders task lists as disabled checkboxes', () => {
    const html = build('- [x] fait\n- [ ] à faire')

    expect(html).toContain('<ul class="task-list">')
    expect(html).toContain('<li class="task-list-item"><input type="checkbox" disabled="" checked="">')
    expect(html).toContain('<input type="checkbox" disabled="">')
    expect(html).not.toContain('data-type="taskList"')
    expect(html).not.toContain('data-checked')
  })

  it('wraps tables for horizontal scrolling', () => {
    const html = build('| A | B |\n| --- | --- |\n| 1 | 2 |')

    expect(html).toContain('<div class="table-scroll"><table>')
    expect(html).toContain('<th>A</th>')
  })

  it('reveals raw HTML blocks and strips active content', () => {
    const markdown = `<div class="encadre">
Bonjour <strong>monde</strong>
<script>alert('x')</script>
<a href="javascript:alert('x')" onclick="alert('x')">lien</a>
</div>

Après.
`
    const html = build(markdown)

    expect(html).toContain('<div class="encadre">')
    expect(html).toContain('<strong>monde</strong>')
    expect(html).toContain('<a>lien</a>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('onclick')
    expect(html).toContain('Après.')
  })

  it('resolves relative images against the document directory', () => {
    const html = build('![Photo](assets/photo.png)')

    expect(html).toContain('src="local-file:///docs/project/assets/photo.png"')
  })

  it('keeps relative image paths when no document directory is known', () => {
    const html = build('![Photo](assets/photo.png)', null)

    expect(html).toContain('src="assets/photo.png"')
  })
})
