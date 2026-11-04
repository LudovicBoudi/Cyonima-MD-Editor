import { readFileSync, rmSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { AutosaveRecord } from '../shared/types'
import { writeFileAtomic } from './atomicWrite'

const FILE_NAME = 'autosave.json'

export function autosavePath(userData: string): string {
  return join(userData, FILE_NAME)
}

/**
 * Synchronous read for the startup path, before the window exists.
 * Returns `null` when no draft is present or it cannot be parsed.
 */
export function readAutosaveSync(userData: string): AutosaveRecord | null {
  try {
    return JSON.parse(readFileSync(autosavePath(userData), 'utf8')) as AutosaveRecord
  } catch {
    return null
  }
}

export async function readAutosave(userData: string): Promise<AutosaveRecord | null> {
  try {
    return JSON.parse(await readFile(autosavePath(userData), 'utf8')) as AutosaveRecord
  } catch {
    return null
  }
}

export async function writeAutosave(userData: string, record: AutosaveRecord): Promise<void> {
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
