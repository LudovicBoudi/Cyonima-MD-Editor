export interface TextStats {
  words: number
  characters: number
}

export interface CaretPosition {
  /** 1-based line in the plain text, counting block boundaries as line breaks. */
  line: number
  /** 1-based column, counted in characters (graphemes). */
  column: number
}

const wordSegmenter = new Intl.Segmenter('fr', { granularity: 'word' })
const graphemeSegmenter = new Intl.Segmenter('fr', { granularity: 'grapheme' })

/** Hyphen-minus, Unicode hyphen and non-breaking hyphen. */
const HYPHENS = new Set(['-', '\u2010', '\u2011'])

/**
 * Counts words with the ICU word rules: `l'homme` and `aujourd’hui` stay one
 * word, `3,14` is one number, and hyphenated compounds such as `peut-être` or
 * `c'est-à-dire` count once instead of once per part.
 */
export function countWords(text: string): number {
  const segments = Array.from(wordSegmenter.segment(text))
  let words = 0

  segments.forEach((segment, index) => {
    if (!segment.isWordLike) return
    const joinedToPrevious =
      index >= 2 &&
      HYPHENS.has(segments[index - 1].segment) &&
      segments[index - 2].isWordLike
    if (!joinedToPrevious) words += 1
  })

  return words
}

/** Counts user-perceived characters (graphemes), ignoring line breaks. */
export function countCharacters(text: string): number {
  let characters = 0
  for (const segment of graphemeSegmenter.segment(text)) {
    if (segment.segment !== '\n') characters += 1
  }
  return characters
}

export function countStats(text: string): TextStats {
  return { words: countWords(text), characters: countCharacters(text) }
}

/** Position of the caret, given the plain text before it. */
export function caretPositionFrom(textBeforeCaret: string): CaretPosition {
  const lastBreak = textBeforeCaret.lastIndexOf('\n')
  const line = textBeforeCaret.split('\n').length
  const column = countCharacters(textBeforeCaret.slice(lastBreak + 1)) + 1
  return { line, column }
}
