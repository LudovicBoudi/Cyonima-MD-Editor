import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AutosaveEntry, AutosaveRecord } from '../shared/types'
import { autosavePath, clearAutosave, clearAutosaveSync, readAutosave, readAutosaveSync, writeAutosave } from './autosave'

let userData: string

const ENTRY: AutosaveEntry = {
  id: 'tab-1',
  path: '/tmp/note.md',
  name: 'note.md',
  content: '# Brouillon\n\nTexte non enregistré.\n',
  format: { encoding: 'utf-8', bom: false, eol: 'lf' }
}

const RECORD = (documents: AutosaveEntry[]): AutosaveRecord => ({ savedAt: 1730000000000, documents })

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

  it('round-trips several documents through write and read', async () => {
    const second: AutosaveEntry = { ...ENTRY, id: 'tab-2', path: null, name: 'Sans titre' }
    await writeAutosave(userData, [ENTRY, second])

    const record = await readAutosave(userData)
    expect(record?.documents).toEqual([ENTRY, second])
    expect(readAutosaveSync(userData)?.documents).toEqual([ENTRY, second])
  })

  it('stores the drafts as a JSON file in userData', async () => {
    await writeAutosave(userData, [ENTRY])

    const raw = JSON.parse(await readFile(autosavePath(userData), 'utf8'))
    expect(raw.documents).toEqual([ENTRY])
    expect(typeof raw.savedAt).toBe('number')
  })

  it('replaces the previous drafts on each write', async () => {
    await writeAutosave(userData, [ENTRY])
    const updated = { ...ENTRY, content: '# Nouveau contenu\n' }
    await writeAutosave(userData, [updated])

    expect((await readAutosave(userData))?.documents).toEqual([updated])
  })

  it('removes the file when no document is left', async () => {
    await writeAutosave(userData, [ENTRY])
    await writeAutosave(userData, [])

    expect(readAutosaveSync(userData)).toBeNull()
  })

  it('reads a draft written before tabs existed as one document', async () => {
    const legacy = {
      path: '/tmp/note.md',
      name: 'note.md',
      content: ENTRY.content,
      format: ENTRY.format,
      savedAt: 1730000000000
    }
    await writeFile(autosavePath(userData), JSON.stringify(legacy), 'utf8')

    const record = readAutosaveSync(userData)
    expect(record?.documents).toHaveLength(1)
    expect(record?.documents[0]).toMatchObject({ id: 'legacy', content: ENTRY.content })
  })

  it('ignores files that are not drafts', async () => {
    await writeFile(autosavePath(userData), '{"hello": true}', 'utf8')

    expect(readAutosaveSync(userData)).toBeNull()
  })

  it('clears an existing draft', async () => {
    await writeAutosave(userData, [ENTRY])
    await clearAutosave(userData)

    expect(readAutosaveSync(userData)).toBeNull()
  })

  it('clears synchronously without throwing when missing', () => {
    clearAutosaveSync(userData)
    expect(readAutosaveSync(userData)).toBeNull()

    clearAutosaveSync(join(userData, 'does-not-exist'))
  })
})
