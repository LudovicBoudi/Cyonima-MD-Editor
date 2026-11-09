import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SNIPPETS, DEFAULT_TEMPLATES } from '../shared/templates'
import { libraryRoot, loadLibrary } from './library'

let userData: string

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'cyonima-library-'))
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

describe('loadLibrary', () => {
  it('writes the starter templates and snippets on first run', () => {
    const state = loadLibrary(userData)

    expect(state.templates.map((entry) => entry.name)).toEqual(Object.keys(DEFAULT_TEMPLATES).sort((a, b) => a.localeCompare(b, 'fr')))
    expect(state.snippets.map((entry) => entry.name)).toEqual(Object.keys(DEFAULT_SNIPPETS).sort((a, b) => a.localeCompare(b, 'fr')))
    expect(state.folder).toBe(libraryRoot(userData))
  })

  it('returns the content of each file', () => {
    const state = loadLibrary(userData)
    const readme = state.templates.find((entry) => entry.name === 'README')

    expect(readme?.content).toBe(DEFAULT_TEMPLATES.README)
  })

  it('keeps user edits instead of rewriting the starter files', () => {
    loadLibrary(userData)
    const file = join(libraryRoot(userData), 'templates', 'README.md')
    writeFileSync(file, '# Mon modèle\n', 'utf8')

    const state = loadLibrary(userData)

    expect(state.templates.find((entry) => entry.name === 'README')?.content).toBe('# Mon modèle\n')
    expect(readFileSync(file, 'utf8')).toBe('# Mon modèle\n')
  })

  it('lists user-added Markdown files and ignores other files', () => {
    loadLibrary(userData)
    const templates = join(libraryRoot(userData), 'templates')
    writeFileSync(join(templates, 'Compte rendu.MD'), '# CR\n', 'utf8')
    writeFileSync(join(templates, 'notes.txt'), 'pas un modèle', 'utf8')
    mkdirSync(join(templates, 'dossier.md'))

    const names = loadLibrary(userData).templates.map((entry) => entry.name)

    expect(names).toContain('Compte rendu')
    expect(names).not.toContain('notes')
    expect(names).not.toContain('dossier')
  })

  it('does not recreate a folder that already exists, even when empty', () => {
    loadLibrary(userData)
    rmSync(join(libraryRoot(userData), 'snippets', 'Date.md'))

    const state = loadLibrary(userData)

    expect(state.snippets.map((entry) => entry.name)).not.toContain('Date')
  })
})
