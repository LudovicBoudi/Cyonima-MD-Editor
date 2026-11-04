export interface SearchMatch {
  from: number
  to: number
}

export interface SearchOptions {
  caseSensitive: boolean
  regex: boolean
}

export interface TextSegment {
  text: string
  /** Global document position of the segment start. */
  offset: number
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Builds a global regular expression from a search term, or `null` when the
 * term is empty or the (regex) pattern is invalid.
 */
export function buildSearchRegex(term: string, options: SearchOptions): RegExp | null {
  if (!term) return null

  const pattern = options.regex ? term : escapeRegExp(term)
  const flags = `g${options.caseSensitive ? '' : 'i'}`

  try {
    return new RegExp(pattern, flags)
  } catch {
    return null
  }
}

function asGlobal(regex: RegExp): RegExp {
  return regex.global ? regex : new RegExp(regex.source, `${regex.flags}g`)
}

/**
 * Finds matches across text segments, mapping each match to global document
 * positions. Matches never span segments (which matches per-text-node search),
 * and zero-length matches are skipped to avoid infinite loops.
 */
export function findMatchesInSegments(segments: TextSegment[], regex: RegExp): SearchMatch[] {
  const matches: SearchMatch[] = []

  for (const segment of segments) {
    const re = asGlobal(regex)
    re.lastIndex = 0

    let match: RegExpExecArray | null
    while ((match = re.exec(segment.text)) !== null) {
      if (match[0].length === 0) {
        re.lastIndex += 1
        continue
      }
      matches.push({
        from: segment.offset + match.index,
        to: segment.offset + match.index + match[0].length
      })
    }
  }

  return matches
}

/** Counts occurrences of `regex` in a flat string. */
export function countMatches(text: string, regex: RegExp): number {
  return text.match(asGlobal(regex))?.length ?? 0
}

/** Replaces every occurrence in a flat string, returning the result and count. */
export function replaceAllInText(
  text: string,
  regex: RegExp,
  replacement: string
): { text: string; count: number } {
  const re = asGlobal(regex)
  const count = text.match(re)?.length ?? 0
  const result = text.replace(new RegExp(re.source, re.flags), replacement)
  return { text: result, count }
}
