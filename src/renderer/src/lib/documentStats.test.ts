import { describe, expect, it } from 'vitest'
import { caretPositionFrom, countCharacters, countStats, countWords } from './documentStats'

describe('word count', () => {
  it('counts simple words and handles empty text', () => {
    expect(countWords('Bonjour le monde')).toBe(3)
    expect(countWords('')).toBe(0)
    expect(countWords('   \n\n  ')).toBe(0)
  })

  it('keeps elisions and typographic apostrophes as one word', () => {
    expect(countWords("l'homme aujourd’hui")).toBe(2)
  })

  it('counts a hyphenated compound once', () => {
    expect(countWords('peut-être')).toBe(1)
    expect(countWords("c'est-à-dire fin")).toBe(2)
    expect(countWords('un - deux')).toBe(2)
  })

  it('counts numbers as words, including decimals', () => {
    expect(countWords('3,14 et 2026')).toBe(3)
  })

  it('ignores punctuation-only segments', () => {
    expect(countWords('Oui — non !')).toBe(2)
  })
})

describe('character count', () => {
  it('counts graphemes instead of UTF-16 units', () => {
    expect(countCharacters('👍🏽')).toBe(1)
    expect(countCharacters('e\u0301')).toBe(1)
    expect(countCharacters('été')).toBe(3)
  })

  it('ignores line breaks but keeps spaces', () => {
    expect(countCharacters('a b\n\nc')).toBe(4)
  })

  it('returns both counts together', () => {
    expect(countStats('Bonjour le monde')).toEqual({ words: 3, characters: 16 })
  })
})

describe('caret position', () => {
  it('starts at line 1, column 1', () => {
    expect(caretPositionFrom('')).toEqual({ line: 1, column: 1 })
  })

  it('counts lines and columns from the text before the caret', () => {
    expect(caretPositionFrom('Titre\nDeux')).toEqual({ line: 2, column: 5 })
    expect(caretPositionFrom('Titre\n\n')).toEqual({ line: 3, column: 1 })
  })

  it('counts columns in graphemes', () => {
    expect(caretPositionFrom('👍🏽👍🏽')).toEqual({ line: 1, column: 3 })
  })
})
