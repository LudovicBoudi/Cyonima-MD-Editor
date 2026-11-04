import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadSettings, saveSettings, settingsPath } from './settings'

let userData: string

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'cyonima-settings-'))
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

describe('settings', () => {
  it('returns defaults when no settings file exists', () => {
    expect(loadSettings(userData)).toEqual({ reopenLastDocument: true })
  })

  it('returns defaults when the file is corrupt', () => {
    writeFileSync(settingsPath(userData), '{ not json', 'utf8')
    expect(loadSettings(userData)).toEqual({ reopenLastDocument: true })
  })

  it('merges partial settings over defaults', () => {
    writeFileSync(settingsPath(userData), JSON.stringify({ reopenLastDocument: false }), 'utf8')
    expect(loadSettings(userData)).toEqual({ reopenLastDocument: false })
  })

  it('round-trips through save and load', () => {
    saveSettings(userData, { reopenLastDocument: false })
    expect(loadSettings(userData)).toEqual({ reopenLastDocument: false })
  })
})
