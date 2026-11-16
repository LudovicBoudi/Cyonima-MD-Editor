import { statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Extensions accepted as Markdown documents on the command line. */
export const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'txt']

function pathFromArgument(argument: string): string | null {
  const unquoted = argument.replace(/^"(.*)"$/, '$1')
  if (!/^file:\/\//i.test(unquoted)) return unquoted

  try {
    return fileURLToPath(unquoted)
  } catch {
    return null
  }
}

/**
 * Extracts the first Markdown file path from a list of command-line arguments,
 * ignoring flags and resolving relative paths against an optional base
 * directory. Desktop entries pass `file://` URIs on Linux (`%U`), so both
 * forms are accepted. Returns `null` when no existing Markdown file is found.
 */
export function extractFileArgument(args: string[], baseDirectory?: string): string | null {
  for (const argument of args) {
    if (argument.startsWith('-')) continue

    const candidate = pathFromArgument(argument)
    if (!candidate) continue
    const filePath = /^(?:[a-z]:[\\/]|[\\/])/i.test(candidate)
      ? resolve(candidate)
      : baseDirectory
        ? resolve(baseDirectory, candidate)
        : resolve(candidate)

    if (!MARKDOWN_EXTENSIONS.includes(extname(filePath).slice(1).toLowerCase())) continue

    try {
      if (statSync(filePath).isFile()) return filePath
    } catch {
      // Not an accessible file.
    }
  }
  return null
}
