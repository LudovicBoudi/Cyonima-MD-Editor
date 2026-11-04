import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface AppSettings {
  /** Reopen the most recent document when the app starts with no file argument. */
  reopenLastDocument: boolean
}

const DEFAULTS: AppSettings = {
  reopenLastDocument: true
}

export function settingsPath(userData: string): string {
  return join(userData, 'settings.json')
}

export function loadSettings(userData: string): AppSettings {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(userData), 'utf8'))
    return { ...DEFAULTS, ...raw }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(userData: string, settings: AppSettings): void {
  try {
    writeFileSync(settingsPath(userData), JSON.stringify(settings, null, 2), 'utf8')
  } catch {
    // Settings are best-effort and never fatal.
  }
}
