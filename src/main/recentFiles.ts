import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const MAX_RECENT_FILES = 10

export function recentFilesPath(userData: string): string {
  return join(userData, 'recent-files.json')
}

export function loadRecentFiles(userData: string): string[] {
  try {
    const parsed = JSON.parse(readFileSync(recentFilesPath(userData), 'utf8'))
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_RECENT_FILES)
    }
  } catch {
    // Missing or corrupt: start fresh.
  }
  return []
}

export function saveRecentFiles(userData: string, files: string[]): void {
  try {
    writeFileSync(recentFilesPath(userData), JSON.stringify(files.slice(0, MAX_RECENT_FILES), null, 2), 'utf8')
  } catch {
    // Best effort.
  }
}

/** Moves `path` to the front of the list, deduplicating and capping the size. */
export function addRecentFile(files: string[], path: string): string[] {
  const rest = files.filter((item) => item !== path)
  return [path, ...rest].slice(0, MAX_RECENT_FILES)
}

/** Keeps only entries that still point to an existing file. */
export function filterExistingFiles(files: string[]): string[] {
  return files.filter((path) => {
    try {
      return statSync(path).isFile()
    } catch {
      return false
    }
  })
}
