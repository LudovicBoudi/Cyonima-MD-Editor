import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SNIPPETS,
  expandPlaceholders,
  formatFrenchDate,
  formatFrenchTime
} from './templates'

const NOON = new Date(2026, 10, 9, 14, 5)

describe('formatFrenchDate and formatFrenchTime', () => {
  it('writes the date in French', () => {
    expect(formatFrenchDate(NOON)).toBe('9 novembre 2026')
  })

  it('writes the time on a 24-hour clock with leading zeros', () => {
    expect(formatFrenchTime(NOON)).toBe('14:05')
    expect(formatFrenchTime(new Date(2026, 0, 1, 0, 0))).toBe('00:00')
  })
})

describe('expandPlaceholders', () => {
  it('replaces date and time placeholders', () => {
    expect(expandPlaceholders('Le {{date}} à {{heure}}.', NOON)).toBe(
      'Le 9 novembre 2026 à 14:05.'
    )
  })

  it('uses the interface locale for the date', () => {
    expect(expandPlaceholders('Date: {{date}}', NOON, 'en-US')).toBe('Date: November 9, 2026')
    expect(expandPlaceholders('Date: {{date}}', NOON, 'en-GB')).toBe('Date: 9 November 2026')
  })

  it('leaves unknown placeholders and plain text untouched', () => {
    expect(expandPlaceholders('{{nom}} et texte', NOON)).toBe('{{nom}} et texte')
  })

  it('expands every default snippet', () => {
    expect(expandPlaceholders(DEFAULT_SNIPPETS['Date et heure'], NOON)).toBe(
      '9 novembre 2026 14:05'
    )
  })
})
