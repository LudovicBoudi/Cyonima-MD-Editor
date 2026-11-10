import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { HistoryVersion } from '../shared/types'
import { writeFileAtomic } from './atomicWrite'

/** Versions kept per document; the oldest are removed first. */
export const HISTORY_LIMIT = 100

const VERSION_FILE = /^(\d{1,16})\.md$/
const META_FILE = 'meta.json'

/**
 * One folder per document, named after a hash of its absolute path, so that
 * two files with the same name never share history.
 */
export function historyDirectory(userData: string, filePath: string): string {
  const key = createHash('sha256').update(resolve(filePath)).digest('hex').slice(0, 32)
  return join(userData, 'history', key)
}

async function versionIds(directory: string): Promise<number[]> {
  let names: string[]
  try {
    names = await readdir(directory)
  } catch {
    return []
  }
  return names
    .map((name) => VERSION_FILE.exec(name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b)
}

/**
 * Stores the content of a document before it is replaced. Identical content
 * as the latest version is not stored twice. Returns `true` when a version was
 * written.
 */
export async function recordVersion(
  userData: string,
  filePath: string,
  content: string,
  limit = HISTORY_LIMIT
): Promise<boolean> {
  const directory = historyDirectory(userData, filePath)
  await mkdir(directory, { recursive: true })

  const ids = await versionIds(directory)
  if (ids.length > 0) {
    const latest = await readFile(join(directory, `${ids[ids.length - 1]}.md`), 'utf8')
    if (latest === content) return false
  }

  // Two saves within the same millisecond still get distinct names.
  let savedAt = Date.now()
  if (ids.length > 0 && savedAt <= ids[ids.length - 1]) savedAt = ids[ids.length - 1] + 1

  await writeFileAtomic(join(directory, `${savedAt}.md`), Buffer.from(content, 'utf8'))
  await writeFile(join(directory, META_FILE), JSON.stringify({ path: resolve(filePath) }), 'utf8')

  const all = [...ids, savedAt]
  const excess = all.length - limit
  for (const id of all.slice(0, Math.max(0, excess))) {
    await rm(join(directory, `${id}.md`), { force: true })
  }
  return true
}

/** Versions of a document, newest first. */
export async function listVersions(userData: string, filePath: string): Promise<HistoryVersion[]> {
  const directory = historyDirectory(userData, filePath)
  const ids = await versionIds(directory)
  const versions = await Promise.all(
    ids.map(async (id) => {
      const info = await stat(join(directory, `${id}.md`))
      return { id: String(id), savedAt: id, size: info.size }
    })
  )
  return versions.reverse()
}

/** Content of one version, or `null` when it does not exist. */
export async function readVersion(userData: string, filePath: string, id: string): Promise<string | null> {
  // Ids come from the renderer: only plain timestamps may name a file.
  if (!/^\d{1,16}$/.test(id)) return null
  try {
    return await readFile(join(historyDirectory(userData, filePath), `${id}.md`), 'utf8')
  } catch {
    return null
  }
}
