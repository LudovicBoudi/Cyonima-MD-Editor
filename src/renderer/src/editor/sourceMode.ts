import { marked } from 'marked'
import type { Token } from 'marked'
import { splitFrontmatter } from './markdown'

/**
 * Inline HTML tags the WYSIWYG editor understands and writes back. Anything
 * else keeps its text but loses its markup when the document is saved from the
 * editor.
 */
const REPRESENTED_INLINE_TAGS = new Set([
  'a',
  'b',
  'br',
  'code',
  'del',
  'em',
  'i',
  'img',
  'mark',
  's',
  'strike',
  'strong',
  'u'
])

// Only opening tags are judged: they carry the attributes that matter, and a
// closing tag always pairs with an opening one.
const INLINE_HTML_TAG = /<([a-zA-Z][\w-]*)([^>]*)>/g

function collectLossyTags(tokens: Token[] | undefined, found: Set<string>): void {
  if (!tokens) return

  for (const token of tokens) {
    if (token.type === 'html' && !('block' in token && token.block)) {
      for (const match of token.raw.matchAll(INLINE_HTML_TAG)) {
        const name = match[1].toLowerCase()
        const attributes = match[2]
        const represented =
          name === 'span'
            ? /color\s*:/i.test(attributes)
            : REPRESENTED_INLINE_TAGS.has(name)
        if (!represented) found.add(name)
      }
      continue
    }

    collectLossyTags((token as { tokens?: Token[] }).tokens, found)

    const items = (token as { items?: Token[] }).items
    items?.forEach((item) => collectLossyTags((item as { tokens?: Token[] }).tokens, found))

    if (token.type === 'table') {
      const table = token as unknown as { header: { tokens?: Token[] }[]; rows: { tokens?: Token[] }[][] }
      table.header.forEach((cell) => collectLossyTags(cell.tokens, found))
      table.rows.forEach((row) => row.forEach((cell) => collectLossyTags(cell.tokens, found)))
    }
  }
}

/**
 * Lists the inline HTML tags of a Markdown document that the WYSIWYG editor
 * cannot keep. Block HTML is not listed: it is preserved as an opaque block.
 */
export function findUnrepresentedInlineHtml(markdown: string): string[] {
  const { body } = splitFrontmatter(markdown)
  if (!body.includes('<')) return []

  const found = new Set<string>()
  collectLossyTags(marked.lexer(body), found)
  return [...found].sort()
}
