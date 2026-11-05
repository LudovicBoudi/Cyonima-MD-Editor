import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TYPOGRAPHY,
  DOCUMENT_FONT_OPTIONS,
  normalizeTypography
} from './typography'

describe('typography settings', () => {
  it('exposes the three supported fonts', () => {
    expect(DOCUMENT_FONT_OPTIONS.map((option) => option.value)).toEqual(['serif', 'sans', 'mono'])
  })

  it('returns defaults for missing or invalid values', () => {
    expect(normalizeTypography(undefined)).toEqual(DEFAULT_TYPOGRAPHY)
    expect(
      normalizeTypography({
        fontFamily: 'comic' as never,
        fontSize: 3,
        lineHeight: 12,
        paragraphSpacing: -1
      })
    ).toEqual(DEFAULT_TYPOGRAPHY)
  })

  it('accepts in-range values', () => {
    expect(
      normalizeTypography({
        fontFamily: 'sans',
        fontSize: 18,
        lineHeight: 1.95,
        paragraphSpacing: 0.55
      })
    ).toEqual({
      fontFamily: 'sans',
      fontSize: 18,
      lineHeight: 1.95,
      paragraphSpacing: 0.55
    })
  })

  it('rejects non-finite numbers', () => {
    expect(
      normalizeTypography({
        fontSize: Number.NaN,
        lineHeight: Number.POSITIVE_INFINITY,
        paragraphSpacing: Number.NaN
      })
    ).toMatchObject({
      fontSize: DEFAULT_TYPOGRAPHY.fontSize,
      lineHeight: DEFAULT_TYPOGRAPHY.lineHeight,
      paragraphSpacing: DEFAULT_TYPOGRAPHY.paragraphSpacing
    })
  })
})
