import { describe, expect, it } from 'vitest'
import { DEFAULT_PDF_OPTIONS, normalizePdfOptions } from './pdfOptions'

describe('normalizePdfOptions', () => {
  it('keeps valid boolean choices', () => {
    expect(
      normalizePdfOptions({ header: false, footer: true, toc: true, pageBreakBeforeH1: false })
    ).toEqual({ header: false, footer: true, toc: true, pageBreakBeforeH1: false })
  })

  it('falls back to defaults for missing or invalid values', () => {
    expect(normalizePdfOptions(null)).toEqual(DEFAULT_PDF_OPTIONS)
    expect(normalizePdfOptions({ header: 'oui', toc: 1 })).toEqual({
      ...DEFAULT_PDF_OPTIONS,
      header: DEFAULT_PDF_OPTIONS.header,
      toc: DEFAULT_PDF_OPTIONS.toc
    })
  })

  it('does not add a table of contents by default', () => {
    expect(DEFAULT_PDF_OPTIONS.toc).toBe(false)
  })
})
