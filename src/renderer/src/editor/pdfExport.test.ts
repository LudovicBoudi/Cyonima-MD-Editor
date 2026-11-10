import { describe, expect, it } from 'vitest'
import { DEFAULT_TYPOGRAPHY } from '../../../shared/typography'
import type { PdfExportOptions, TypographySettings } from '../../../shared/types'
import { buildPrintHtml } from './pdfExport'

const OPTIONS: PdfExportOptions = {
  header: true,
  footer: true,
  toc: true,
  pageBreakBeforeH1: true
}

const TYPOGRAPHY: TypographySettings = {
  ...DEFAULT_TYPOGRAPHY,
  fontFamily: 'serif',
  fontSize: 17,
  lineHeight: 1.7,
  paragraphSpacing: 1
}

function build(
  markdown: string,
  options: Partial<PdfExportOptions> = {},
  documentDir: string | null = '/docs/project'
): string {
  return buildPrintHtml({
    markdown,
    fileName: 'rapport.md',
    typography: TYPOGRAPHY,
    documentDir,
    options: { ...OPTIONS, ...options }
  })
}

describe('buildPrintHtml', () => {
  it('produces a complete print document with the chosen typography', () => {
    const html = build('# Titre\n\nUn paragraphe.')

    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('<title>rapport</title>')
    expect(html).toContain('--doc-font-size: 17px')
    expect(html).toContain('--doc-line-height: 1.7')
    expect(html).toContain('<main class="document">')
    expect(html).toContain('<h1 id="titre">Titre</h1>')
    expect(html).not.toContain('local-file://')
  })

  it('builds a linked table of contents from levels 1 to 3 only', () => {
    const html = build('# Un\n\n## Deux\n\n### Trois\n\n#### Quatre')

    expect(html).toContain('aria-label="Table des matières"')
    expect(html).toContain('<li class="toc-level-1"><a href="#un">Un</a></li>')
    expect(html).toContain('<li class="toc-level-2"><a href="#deux">Deux</a></li>')
    expect(html).toContain('<li class="toc-level-3"><a href="#trois">Trois</a></li>')
    expect(html).not.toContain('href="#quatre"')
    expect(html).not.toContain('toc-level-4')
    expect(html.indexOf('class="toc"')).toBeLessThan(html.indexOf('<h1 id="un">'))
  })

  it('gives duplicate and accented headings unique anchors', () => {
    const html = build('# Déjà vu\n\n## Déjà vu\n\n## Déjà vu')

    expect(html).toContain('id="deja-vu"')
    expect(html).toContain('id="deja-vu-2"')
    expect(html).toContain('id="deja-vu-3"')
    expect(html).toContain('href="#deja-vu-2"')
  })

  it('omits the table of contents when the option is off or there is no heading', () => {
    expect(build('# Titre', { toc: false })).not.toContain('class="toc"')
    expect(build('Un paragraphe sans titre.', { toc: true })).not.toContain('class="toc"')
  })

  it('marks the body for page breaks before first-level headings', () => {
    expect(build('# Titre')).toContain('<body class="pdf-break-h1">')
    expect(build('# Titre', { pageBreakBeforeH1: false })).toContain('<body>')
  })

  it('keeps explicit page-break blocks and the print rules that avoid clipping', () => {
    const html = build('<div class="page-break"></div>\n\n# Suite')

    expect(html).toContain('<div class="page-break"></div>')
    expect(html).toContain('thead {\n  display: table-header-group;')
    expect(html).toContain('break-inside: auto')
    expect(html).toContain('white-space: pre-wrap')
    expect(html).toContain('body.pdf-break-h1 h1 {')
  })

  it('uses the frontmatter title and keeps the frontmatter out of the body', () => {
    const html = build('---\ntitle: "Rapport annuel"\nauthor: Cyonima\n---\n\n# Contenu')

    expect(html).toContain('<title>Rapport annuel</title>')
    expect(html).not.toContain('author: Cyonima')
    expect(html).toContain('<h1 id="contenu">Contenu</h1>')
  })

  it('renders footnotes, tasks and tables like the HTML export', () => {
    const markdown = `Une note[^1].\n\n- [x] fait\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n[^1]: Note.`
    const html = build(markdown)

    expect(html).toContain('<div class="footnote" id="fn-1">')
    expect(html).toContain('<input type="checkbox" disabled="" checked="">')
    expect(html).toContain('<div class="table-scroll"><table>')
    expect(html).not.toContain('data-footnote-ref')
  })

  it('resolves local images for the main process to embed', () => {
    const html = build('![Photo](assets/photo.png)')

    expect(html).toContain('src="local-file:///docs/project/assets/photo.png"')
  })
})
