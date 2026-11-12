import { describe, expect, it } from 'vitest'
import { CODE_LANGUAGE_OPTIONS, codeLanguageOptions, isKnownCodeLanguage } from './codeLanguages'

describe('code languages', () => {
  it('starts with no language and exposes the bundled languages', () => {
    expect(CODE_LANGUAGE_OPTIONS[0]).toEqual({ value: '', label: 'Aucune' })
    expect(isKnownCodeLanguage('')).toBe(true)
    expect(isKnownCodeLanguage('typescript')).toBe(true)
    expect(isKnownCodeLanguage('haskell')).toBe(false)
  })

  it('returns the base list for a known language', () => {
    expect(codeLanguageOptions('python')).toBe(CODE_LANGUAGE_OPTIONS)
  })

  it('keeps an unknown language selectable so the fence round-trips', () => {
    const options = codeLanguageOptions('haskell')
    expect(options.at(-1)).toEqual({ value: 'haskell', label: 'haskell' })
    expect(options.slice(0, -1)).toEqual(CODE_LANGUAGE_OPTIONS)
  })

  it('translates the two descriptive labels', () => {
    const english = codeLanguageOptions('', 'en')
    expect(english[0]).toEqual({ value: '', label: 'None' })
    expect(english[1]).toEqual({ value: 'plaintext', label: 'Plain text' })
    expect(codeLanguageOptions('python', 'en')).toHaveLength(CODE_LANGUAGE_OPTIONS.length)
    expect(codeLanguageOptions('python', 'en').find((option) => option.value === 'python')).toEqual({
      value: 'python',
      label: 'Python'
    })
  })

  it('has unique identifiers', () => {
    const values = CODE_LANGUAGE_OPTIONS.map((option) => option.value)
    expect(new Set(values).size).toBe(values.length)
  })
})
