import { load } from 'js-yaml'

export type FrontmatterCheck = { ok: true } | { ok: false; message: string }

const OPENING_FENCE = /^\uFEFF?---[ \t]*\r?\n/
const CLOSING_FENCE = /(?:^|\r?\n)(?:---|\.\.\.)[ \t]*$/
const FENCE_LINE = /^(?:---|\.\.\.)[ \t]*$/m

/** Extracts the YAML text between the `---` fences of a frontmatter block. */
export function frontmatterBody(block: string): string {
  const inner = block
    .replace(OPENING_FENCE, '')
    .replace(CLOSING_FENCE, '')
    .replace(/\r\n/g, '\n')
  return inner ? `${inner}\n` : ''
}

/** Wraps YAML text in `---` fences. Blank text yields `null`: no frontmatter. */
export function frontmatterBlock(yaml: string): string | null {
  // Only blank lines around the YAML are dropped: trailing spaces on a content
  // line belong to the user's text and are kept.
  const body = yaml.replace(/^(?:[ \t]*\n)+/, '').replace(/(?:\n[ \t]*)+$/, '')
  if (!body.trim()) return null
  return `---\n${body}\n---`
}

/** Starter metadata for a document that has none: a quoted title. */
export function defaultFrontmatterYaml(fileName: string): string {
  const title = fileName.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '').trim() || 'Sans titre'
  return `title: ${JSON.stringify(title)}\n`
}

/**
 * Checks that the YAML text can be read back as a mapping of keys and values.
 * A line made only of `---` or `...` would close the block early, so it is
 * refused even when the rest of the YAML is valid.
 */
export function checkFrontmatterYaml(yaml: string): FrontmatterCheck {
  if (!yaml.trim()) return { ok: true }

  if (FENCE_LINE.test(yaml)) {
    return {
      ok: false,
      message: 'Une ligne ne contenant que « --- » fermerait le bloc. Retirez-la.'
    }
  }

  try {
    const value: unknown = load(yaml)
    if (value === undefined || value === null) return { ok: true }
    if (typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, message: 'Les métadonnées doivent être des paires « clé : valeur ».' }
    }
    return { ok: true }
  } catch (error) {
    const mark = (error as { mark?: { line?: number } }).mark
    const line = typeof mark?.line === 'number' ? ` à la ligne ${mark.line + 1}` : ''
    return { ok: false, message: `Syntaxe YAML invalide${line}.` }
  }
}
