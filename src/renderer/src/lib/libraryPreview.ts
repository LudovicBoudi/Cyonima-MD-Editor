import { expandPlaceholders } from '../../../shared/templates'

/** Strips the Markdown markers from a line so the preview reads as prose. */
function plainLine(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/^(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)/, '')
    .replace(/\*\*|__|\*|_|`/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
}

/** The first non-empty lines of a library entry, expanded and without markup. */
export function libraryPreview(content: string, lines = 2): string {
  return expandPlaceholders(content)
    .split('\n')
    .map(plainLine)
    .filter(Boolean)
    .slice(0, lines)
    .join(' · ')
}
