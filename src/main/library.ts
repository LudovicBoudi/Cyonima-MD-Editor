import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { LibraryEntry, LibraryState } from '../shared/types'
import { DEFAULT_SNIPPETS, DEFAULT_TEMPLATES } from '../shared/templates'

const LIBRARY_DIRECTORY = 'library'

export function libraryRoot(userDataDir: string): string {
  return join(userDataDir, LIBRARY_DIRECTORY)
}

function folders(userDataDir: string): { templates: string; snippets: string } {
  const root = libraryRoot(userDataDir)
  return { templates: join(root, 'templates'), snippets: join(root, 'snippets') }
}

/**
 * Starter files are written only when a folder does not exist yet. A user who
 * deletes a folder gets it back on next start; edits and new files are kept.
 */
function seedFolder(directory: string, defaults: Readonly<Record<string, string>>): void {
  if (existsSync(directory)) return
  mkdirSync(directory, { recursive: true })
  for (const [name, content] of Object.entries(defaults)) {
    writeFileSync(join(directory, `${name}.md`), content, 'utf8')
  }
}

export function readLibraryEntries(directory: string): LibraryEntry[] {
  if (!existsSync(directory)) return []

  const entries: LibraryEntry[] = []
  for (const file of readdirSync(directory)) {
    if (!/\.md$/i.test(file)) continue
    try {
      entries.push({
        name: file.replace(/\.md$/i, ''),
        content: readFileSync(join(directory, file), 'utf8')
      })
    } catch {
      // An unreadable file is skipped rather than blocking the whole list.
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

export function loadLibrary(userDataDir: string): LibraryState {
  const { templates, snippets } = folders(userDataDir)
  seedFolder(templates, DEFAULT_TEMPLATES)
  seedFolder(snippets, DEFAULT_SNIPPETS)

  return {
    templates: readLibraryEntries(templates),
    snippets: readLibraryEntries(snippets),
    folder: libraryRoot(userDataDir)
  }
}
