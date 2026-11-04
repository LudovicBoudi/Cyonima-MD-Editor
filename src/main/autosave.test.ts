import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AutosaveRecord } from '../shared/types'
import { autosavePath, clearAutosave, clearAutosaveSync, readAutosave, readAutosaveSync, writeAutosave } from './autosave'

let userData: string

const RECORD: AutosaveRecord = {
  path: '/tmp/note.md',
  name: 'note.md',
  content: '# Brouillon\n\nTexte non enregistré.\n',
  format: { encoding: 'utf-8', bom: false, eol: 'lf' },
  savedAt: 1730000000000
}

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), 'cyonima-autosave-'))
})

afterEach(async () => {
  await rm(userData, { recursive: true, force: true })
})

describe('autosave storage', () => {
  it('returns null when no draft exists', () => {
    expect(readAutosaveSync(userData)).toBeNull()
  })

  it('round-trips a draft through write and read', async () => {
    await writeAutosave(userData, RECORD)

    expect(await readAutosave(userData)).toEqual(RECORD)
    expect(readAutosaveSync(userData)).toEqual(RECORD)
  })

  it('stores the draft as a JSON file in userData', async () => {
    await writeAutosave(userData, RECORD)

    const raw = await readFile(autosavePath(userData), 'utf8')
    expect(JSON.parse(raw)).toEqual(RECORD)
  })

  it('overwrites a previous draft', async () => {
    await writeAutosave(userData, RECORD)
    const updated = { ...RECORD, content: '# Nouveau contenu\n' }
    await writeAutosave(userData, updated)

    expect(await readAutosave(userData)).toEqual(updated)
  })

  it('clears an existing draft', async () => {
    await writeAutosave(userData, RECORD)
    await clearAutosave(userData)

    expect(readAutosaveSync(userData)).toBeNull()
  })

  it('clears synchronously without throwing when missing', () => {
    clearAutosaveSync(userData)
    expect(readAutosaveSync(userData)).toBeNull()

    clearAutosaveSync(join(userData, 'does-not-exist'))
  })
})
