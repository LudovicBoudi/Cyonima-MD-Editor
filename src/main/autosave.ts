import { readFileSync, rmSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { AutosaveEntry, AutosaveRecord } from '../shared/types'
import { writeFileAtomic } from './atomicWrite'

const FILE_NAME = 'autosave.json'

export function autosavePath(userData: string): string {
  return join(userData, FILE_NAME)
}

/**
 * Drafts written before tabs existed hold a single document at the top level.
 * They are read as one entry so that an update does not lose them.
 */
function normalizeRecord(raw: unknown): AutosaveRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<AutosaveRecord> & Partial<AutosaveEntry>

  if (Array.isArray(value.documents)) {
    return { savedAt: typeof value.savedAt === 'number' ? value.savedAt : 0, documents: value.documents }
  }
  if (typeof value.content === 'string' && value.format) {
    const { savedAt, ...entry } = value
    return {
      savedAt: typeof savedAt === 'number' ? savedAt : 0,
      documents: [{ ...entry, id: 'legacy' } as AutosaveEntry]
    }
  }
  return null
}

/**
 * Synchronous read for the startup path, before the window exists.
 * Returns `null` when no draft is present or it cannot be parsed.
 */
export function readAutosaveSync(userData: string): AutosaveRecord | null {
  try {
    return normalizeRecord(JSON.parse(readFileSync(autosavePath(userData), 'utf8')))
  } catch {
    return null
  }
}

export async function readAutosave(userData: string): Promise<AutosaveRecord | null> {
  try {
    return normalizeRecord(JSON.parse(await readFile(autosavePath(userData), 'utf8')))
  } catch {
    return null
  }
}

/** Replaces every recovery copy. An empty list removes the file. */
export async function writeAutosave(userData: string, documents: AutosaveEntry[]): Promise<void> {
  if (documents.length === 0) {
    await clearAutosave(userData)
    return
  }
  const record: AutosaveRecord = { savedAt: Date.now(), documents }
  await writeFileAtomic(autosavePath(userData), Buffer.from(JSON.stringify(record, null, 2), 'utf8'))
}

export async function clearAutosave(userData: string): Promise<void> {
  await rm(autosavePath(userData), { force: true })
}

export function clearAutosaveSync(userData: string): void {
  try {
    rmSync(autosavePath(userData), { force: true })
  } catch {
    // Nothing to clean up.
  }
}
