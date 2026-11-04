import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_RECENT_FILES,
  addRecentFile,
  filterExistingFiles,
  loadRecentFiles,
  recentFilesPath,
  saveRecentFiles
} from './recentFiles'

let userData: string

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'cyonima-recent-'))
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

describe('addRecentFile', () => {
  it('adds a new file to the front', () => {
    expect(addRecentFile(['/a.md', '/b.md'], '/c.md')).toEqual(['/c.md', '/a.md', '/b.md'])
  })

  it('moves an existing file to the front without duplicating', () => {
    expect(addRecentFile(['/a.md', '/b.md', '/c.md'], '/b.md')).toEqual(['/b.md', '/a.md', '/c.md'])
  })

  it('caps the list at the maximum size', () => {
    const files = Array.from({ length: MAX_RECENT_FILES }, (_, index) => `/f${index}.md`)
    const result = addRecentFile(files, '/new.md')

    expect(result).toHaveLength(MAX_RECENT_FILES)
    expect(result[0]).toBe('/new.md')
    expect(result).not.toContain(`/f${MAX_RECENT_FILES - 1}.md`)
  })
})

describe('filterExistingFiles', () => {
  it('keeps only existing files', () => {
    const file = join(userData, 'exists.md')
    writeFileSync(file, '', 'utf8')

    const result = filterExistingFiles([file, join(userData, 'missing.md')])
    expect(result).toEqual([file])
  })
})

describe('persistence', () => {
  it('round-trips the list through save and load', () => {
    const files = ['/a.md', '/b.md']
    saveRecentFiles(userData, files)
    expect(loadRecentFiles(userData)).toEqual(files)
  })

  it('returns an empty list when missing or corrupt', () => {
    expect(loadRecentFiles(userData)).toEqual([])

    writeFileSync(recentFilesPath(userData), '{ not json', 'utf8')
    expect(loadRecentFiles(userData)).toEqual([])
  })

  it('ignores non-string entries', () => {
    writeFileSync(recentFilesPath(userData), JSON.stringify(['/a.md', 42, null, '/b.md']), 'utf8')
    expect(loadRecentFiles(userData)).toEqual(['/a.md', '/b.md'])
  })
})
