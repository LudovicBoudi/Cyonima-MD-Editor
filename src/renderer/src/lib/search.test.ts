import { describe, expect, it } from 'vitest'
import {
  buildSearchRegex,
  countMatches,
  escapeRegExp,
  findMatchesInSegments,
  replaceAllInText
} from './search'

describe('buildSearchRegex', () => {
  it('returns null for an empty term', () => {
    expect(buildSearchRegex('', { caseSensitive: false, regex: false })).toBeNull()
  })

  it('escapes special characters in literal mode', () => {
    const regex = buildSearchRegex('a.b', { caseSensitive: false, regex: false })
    expect(regex).not.toBeNull()
    expect(regex!.test('axb')).toBe(false)
    expect(regex!.test('a.b')).toBe(true)
  })

  it('honours case sensitivity', () => {
    const insensitive = buildSearchRegex('Bonjour', { caseSensitive: false, regex: false })!
    const sensitive = buildSearchRegex('Bonjour', { caseSensitive: true, regex: false })!

    expect(insensitive.test('bonjour')).toBe(true)
    expect(sensitive.test('bonjour')).toBe(false)
  })

  it('returns null for an invalid regex', () => {
    expect(buildSearchRegex('[', { caseSensitive: false, regex: true })).toBeNull()
  })
})

describe('escapeRegExp', () => {
  it('escapes regex metacharacters', () => {
    expect(escapeRegExp('a+b*c?d.e(f)')).toBe('a\\+b\\*c\\?d\\.e\\(f\\)')
  })
})

describe('findMatchesInSegments', () => {
  it('finds matches and maps them to global positions', () => {
    const regex = buildSearchRegex('foo', { caseSensitive: false, regex: false })!
    const matches = findMatchesInSegments(
      [
        { text: 'foo bar', offset: 0 },
        { text: 'baz foo', offset: 20 }
      ],
      regex
    )

    expect(matches).toEqual([
      { from: 0, to: 3 },
      { from: 24, to: 27 }
    ])
  })

  it('finds multiple matches in one segment', () => {
    const regex = buildSearchRegex('a', { caseSensitive: false, regex: false })!
    const matches = findMatchesInSegments([{ text: 'banana', offset: 5 }], regex)

    expect(matches).toEqual([
      { from: 6, to: 7 },
      { from: 8, to: 9 },
      { from: 10, to: 11 }
    ])
  })

  it('skips zero-length matches', () => {
    const regex = buildSearchRegex('a*', { caseSensitive: false, regex: true })!
    const matches = findMatchesInSegments([{ text: 'aa', offset: 0 }], regex)

    expect(matches.length).toBeGreaterThan(0)
    for (const match of matches) expect(match.to).toBeGreaterThan(match.from)
  })

  it('returns no matches when nothing matches', () => {
    const regex = buildSearchRegex('xyz', { caseSensitive: false, regex: false })!
    expect(findMatchesInSegments([{ text: 'abc', offset: 0 }], regex)).toEqual([])
  })
})

describe('countMatches and replaceAllInText', () => {
  it('counts occurrences', () => {
    const regex = buildSearchRegex('foo', { caseSensitive: false, regex: false })!
    expect(countMatches('foo bar foo', regex)).toBe(2)
  })

  it('replaces all occurrences and reports the count', () => {
    const regex = buildSearchRegex('foo', { caseSensitive: false, regex: false })!
    const result = replaceAllInText('foo bar foo', regex, 'bar')

    expect(result).toEqual({ text: 'bar bar bar', count: 2 })
  })

  it('supports capture-group references in the replacement', () => {
    const regex = buildSearchRegex('(\\w+)-(\\w+)', { caseSensitive: false, regex: true })!
    const result = replaceAllInText('a-b c-d', regex, '$2:$1')

    expect(result.text).toBe('b:a d:c')
    expect(result.count).toBe(2)
  })
})
