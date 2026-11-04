import { chmod, lstat, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFileAtomic } from './atomicWrite'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cyonima-atomic-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('atomic file writing', () => {
  it('creates a new file with the expected content', async () => {
    const target = join(directory, 'note.md')

    await writeFileAtomic(target, Buffer.from('# Bonjour\n'))

    expect(await readFile(target, 'utf8')).toBe('# Bonjour\n')
  })

  it('overwrites an existing file and leaves no temporary file behind', async () => {
    const target = join(directory, 'note.md')
    await writeFile(target, 'ancien contenu', 'utf8')

    await writeFileAtomic(target, Buffer.from('nouveau contenu'))

    expect(await readFile(target, 'utf8')).toBe('nouveau contenu')
    expect(await readdir(directory)).toEqual(['note.md'])
  })

  it('preserves the permissions of an existing file', async () => {
    const target = join(directory, 'note.md')
    await writeFile(target, 'ancien', 'utf8')
    await chmod(target, 0o640)

    await writeFileAtomic(target, Buffer.from('nouveau'))

    const info = await stat(target)
    expect(info.mode & 0o777).toBe(0o640)
  })

  it('refuses to overwrite a read-only file without altering it', async () => {
    const target = join(directory, 'note.md')
    await writeFile(target, 'contenu protégé', 'utf8')
    await chmod(target, 0o444)

    await expect(writeFileAtomic(target, Buffer.from('écrasé'))).rejects.toThrow(/lecture seule/)
    expect(await readFile(target, 'utf8')).toBe('contenu protégé')
  })

  it('refuses a directory target with an explicit message', async () => {
    await expect(writeFileAtomic(directory, Buffer.from('x'))).rejects.toThrow(/n’est pas un fichier/)
  })

  it.skipIf(process.platform === 'win32')(
    'writes through a symlink without replacing the link',
    async () => {
      const target = join(directory, 'real.md')
      const link = join(directory, 'link.md')
      await writeFile(target, 'ancien', 'utf8')
      await symlink(target, link)

      await writeFileAtomic(link, Buffer.from('nouveau'))

      expect((await lstat(link)).isSymbolicLink()).toBe(true)
      expect(await readFile(target, 'utf8')).toBe('nouveau')
    }
  )
})
