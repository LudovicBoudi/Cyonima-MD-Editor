import type { PdfExportOptions } from '../../../shared/types'

/** Remembers the last PDF layout choices between exports. */
export const PDF_OPTIONS_STORAGE_KEY = 'cyonima-pdf-options'

export const DEFAULT_PDF_OPTIONS: PdfExportOptions = {
  header: true,
  footer: true,
  toc: false,
  pageBreakBeforeH1: true
}

export function normalizePdfOptions(raw: unknown): PdfExportOptions {
  const value = (raw ?? {}) as Partial<PdfExportOptions>
  const read = (key: keyof PdfExportOptions): boolean =>
    typeof value[key] === 'boolean' ? (value[key] as boolean) : DEFAULT_PDF_OPTIONS[key]

  return {
    header: read('header'),
    footer: read('footer'),
    toc: read('toc'),
    pageBreakBeforeH1: read('pageBreakBeforeH1')
  }
}

export function readStoredPdfOptions(): PdfExportOptions {
  try {
    const raw = window.localStorage.getItem(PDF_OPTIONS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PDF_OPTIONS }
    return normalizePdfOptions(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_PDF_OPTIONS }
  }
}

export function storePdfOptions(options: PdfExportOptions): void {
  try {
    window.localStorage.setItem(PDF_OPTIONS_STORAGE_KEY, JSON.stringify(options))
  } catch {
    // The export still works when storage is unavailable.
  }
}
