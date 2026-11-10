import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listVersions, readVersion, recordVersion } from './history'

let userData: string
const FILE = '/docs/projet/note.md'

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), 'cyonima-history-'))
})

afterEach(async () => {
  await rm(userData, { recursive: true, force: true })
})

describe('document history', () => {
  it('returns no versions for a document never saved', async () => {
    expect(await listVersions(userData, FILE)).toEqual([])
  })

  it('stores a version and reads it back', async () => {
    expect(await recordVersion(userData, FILE, '# Un\n')).toBe(true)

    const [version] = await listVersions(userData, FILE)
    expect(version).toMatchObject({ savedAt: Number(version.id), size: 5 })
    expect(await readVersion(userData, FILE, version.id)).toBe('# Un\n')
  })

  it('does not store the same content twice in a row', async () => {
    await recordVersion(userData, FILE, 'même')

    expect(await recordVersion(userData, FILE, 'même')).toBe(false)
    expect(await listVersions(userData, FILE)).toHaveLength(1)
  })

  it('lists the newest version first, even within the same millisecond', async () => {
    await recordVersion(userData, FILE, 'v1')
    await recordVersion(userData, FILE, 'v2')
    await recordVersion(userData, FILE, 'v3')

    const versions = await listVersions(userData, FILE)
    expect(versions).toHaveLength(3)
    expect(versions.every((version, index) => index === 0 || Number(versions[index - 1].id) > Number(version.id))).toBe(true)
    expect(await readVersion(userData, FILE, versions[0].id)).toBe('v3')
  })

  it('keeps only the most recent versions', async () => {
    for (const text of ['a', 'b', 'c', 'd', 'e']) {
      await recordVersion(userData, FILE, text, 3)
    }

    const versions = await listVersions(userData, FILE)
    expect(versions).toHaveLength(3)
    expect(await readVersion(userData, FILE, versions[0].id)).toBe('e')
    expect(await readVersion(userData, FILE, versions[2].id)).toBe('c')
  })

  it('keeps the histories of files that share a name apart', async () => {
    await recordVersion(userData, '/a/note.md', 'premier')
    await recordVersion(userData, '/b/note.md', 'second')

    expect((await listVersions(userData, '/a/note.md'))).toHaveLength(1)
    const [other] = await listVersions(userData, '/b/note.md')
    expect(await readVersion(userData, '/b/note.md', other.id)).toBe('second')
  })

  it('refuses ids that are not plain timestamps', async () => {
    await recordVersion(userData, FILE, 'secret')

    expect(await readVersion(userData, FILE, '../../etc/passwd')).toBeNull()
    expect(await readVersion(userData, FILE, 'inconnu')).toBeNull()
  })
})
