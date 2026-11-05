import type { DocumentFont, TypographySettings } from './types'

export const DOCUMENT_FONT_OPTIONS: Array<{ value: DocumentFont; label: string }> = [
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans' },
  { value: 'mono', label: 'Mono' }
]

const DOCUMENT_FONTS = DOCUMENT_FONT_OPTIONS.map((option) => option.value)

export const FONT_SIZE_MIN = 14
export const FONT_SIZE_MAX = 24
export const LINE_HEIGHT_MIN = 1.3
export const LINE_HEIGHT_MAX = 2.2
export const PARAGRAPH_SPACING_MIN = 0.4
export const PARAGRAPH_SPACING_MAX = 1.8

export const DEFAULT_TYPOGRAPHY: TypographySettings = {
  fontFamily: 'serif',
  fontSize: 17,
  lineHeight: 1.7,
  paragraphSpacing: 1
}

function isDocumentFont(value: unknown): value is DocumentFont {
  return typeof value === 'string' && (DOCUMENT_FONTS as readonly string[]).includes(value)
}

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback
}

/** Keeps only known, well-typed typography settings. */
export function normalizeTypography(
  raw: Partial<TypographySettings> | undefined
): TypographySettings {
  return {
    fontFamily: isDocumentFont(raw?.fontFamily)
      ? raw.fontFamily
      : DEFAULT_TYPOGRAPHY.fontFamily,
    fontSize: numberInRange(
      raw?.fontSize,
      DEFAULT_TYPOGRAPHY.fontSize,
      FONT_SIZE_MIN,
      FONT_SIZE_MAX
    ),
    lineHeight: numberInRange(
      raw?.lineHeight,
      DEFAULT_TYPOGRAPHY.lineHeight,
      LINE_HEIGHT_MIN,
      LINE_HEIGHT_MAX
    ),
    paragraphSpacing: numberInRange(
      raw?.paragraphSpacing,
      DEFAULT_TYPOGRAPHY.paragraphSpacing,
      PARAGRAPH_SPACING_MIN,
      PARAGRAPH_SPACING_MAX
    )
  }
}
