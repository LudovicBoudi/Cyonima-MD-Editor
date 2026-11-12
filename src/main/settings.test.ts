import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_TYPOGRAPHY } from '../shared/typography'
import {
  PREFERENCES_VERSION,
  isPageWidth,
  isThemePreference,
  loadSettings,
  migratePreferences,
  normalizeViewSettings,
  preferencesPath,
  sanitizePreferencesPatch,
  saveSettings
} from './settings'
import { existsSync, readFileSync } from 'node:fs'

let userData: string

const DEFAULTS = {
  reopenLastDocument: true,
  theme: 'system',
  spellCheck: true,
  spellLanguage: 'fr-FR',
  autosaveSeconds: 7,
  language: 'system',
  focusMode: false,
  pageWidth: 'normal',
  typewriterMode: false,
  wordGoal: null,
  ...DEFAULT_TYPOGRAPHY
} as const

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'cyonima-settings-'))
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

describe('settings', () => {
  it('returns defaults when no settings file exists', () => {
    expect(loadSettings(userData)).toEqual(DEFAULTS)
  })

  it('returns defaults when the file is corrupt', () => {
    writeFileSync(preferencesPath(userData), '{ not json', 'utf8')
    expect(loadSettings(userData)).toEqual(DEFAULTS)
  })

  it('normalises invalid spelling settings', () => {
    writeFileSync(
      preferencesPath(userData),
      JSON.stringify({ spellCheck: 'no', spellLanguage: 'not a language!' }),
      'utf8'
    )
    expect(loadSettings(userData)).toEqual(DEFAULTS)
  })

  it('merges partial settings over defaults', () => {
    writeFileSync(preferencesPath(userData), JSON.stringify({ reopenLastDocument: false }), 'utf8')
    expect(loadSettings(userData)).toEqual({ ...DEFAULTS, reopenLastDocument: false })
  })

  it('round-trips through save and load', () => {
    saveSettings(userData, {
      reopenLastDocument: false,
      theme: 'dark',
      spellCheck: false,
      spellLanguage: 'en-GB',
      autosaveSeconds: 15,
      language: 'en',
      focusMode: true,
      pageWidth: 'wide',
      typewriterMode: true,
      fontFamily: 'sans',
      fontSize: 19,
      lineHeight: 1.9,
      paragraphSpacing: 1.4,
      wordGoal: 750
    })
    expect(loadSettings(userData)).toEqual({
      reopenLastDocument: false,
      theme: 'dark',
      spellCheck: false,
      spellLanguage: 'en-GB',
      autosaveSeconds: 15,
      language: 'en',
      focusMode: true,
      pageWidth: 'wide',
      typewriterMode: true,
      fontFamily: 'sans',
      fontSize: 19,
      lineHeight: 1.9,
      paragraphSpacing: 1.4,
      wordGoal: 750
    })
  })

  it('falls back to the system theme when the stored value is invalid', () => {
    writeFileSync(preferencesPath(userData), JSON.stringify({ theme: 'neon' }), 'utf8')
    expect(loadSettings(userData).theme).toBe('system')
  })

  it('recognises only supported theme preferences', () => {
    expect(isThemePreference('light')).toBe(true)
    expect(isThemePreference('dark')).toBe(true)
    expect(isThemePreference('system')).toBe(true)
    expect(isThemePreference('neon')).toBe(false)
    expect(isThemePreference(null)).toBe(false)
  })

  it('recognises only supported page widths', () => {
    expect(isPageWidth('narrow')).toBe(true)
    expect(isPageWidth('full')).toBe(true)
    expect(isPageWidth('giant')).toBe(false)
    expect(isPageWidth(42)).toBe(false)
  })

  it('normalises invalid view settings', () => {
    expect(normalizeViewSettings(undefined)).toEqual({
      ...DEFAULT_TYPOGRAPHY,
      focusMode: false,
      pageWidth: 'normal',
      typewriterMode: false,
      wordGoal: null
    })
    expect(
      normalizeViewSettings({
        focusMode: 'yes' as unknown as boolean,
        pageWidth: 'giant' as never,
        typewriterMode: 1 as unknown as boolean,
        fontFamily: 'comic' as never,
        fontSize: 42,
        lineHeight: 0.2,
        paragraphSpacing: 9,
        wordGoal: 3.5
      })
    ).toEqual({
      ...DEFAULT_TYPOGRAPHY,
      focusMode: false,
      pageWidth: 'normal',
      typewriterMode: false,
      wordGoal: null
    })
  })

  it('keeps in-range typography settings', () => {
    expect(
      normalizeViewSettings({
        fontFamily: 'mono',
        fontSize: 20,
        lineHeight: 2.05,
        paragraphSpacing: 0.6
      })
    ).toMatchObject({
      fontFamily: 'mono',
      fontSize: 20,
      lineHeight: 2.05,
      paragraphSpacing: 0.6
    })
  })
})

describe('preferences file', () => {
  it('writes a versioned file', () => {
    saveSettings(userData, { ...DEFAULTS, reopenLastDocument: false } as never)
    const raw = JSON.parse(readFileSync(preferencesPath(userData), 'utf8'))

    expect(raw.version).toBe(PREFERENCES_VERSION)
    expect(raw.settings.reopenLastDocument).toBe(false)
  })

  it('migrates the legacy settings.json and keeps it in place', () => {
    writeFileSync(
      join(userData, 'settings.json'),
      JSON.stringify({ theme: 'dark', spellLanguage: 'en-GB', reopenLastDocument: false }),
      'utf8'
    )

    const settings = loadSettings(userData)

    expect(settings).toMatchObject({ theme: 'dark', spellLanguage: 'en-GB', reopenLastDocument: false })
    expect(settings.autosaveSeconds).toBe(7)
    expect(existsSync(join(userData, 'settings.json'))).toBe(true)
    expect(JSON.parse(readFileSync(preferencesPath(userData), 'utf8')).version).toBe(PREFERENCES_VERSION)
  })

  it('prefers preferences.json over a legacy file', () => {
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({ theme: 'dark' }), 'utf8')
    saveSettings(userData, { ...DEFAULTS, theme: 'light' } as never)

    expect(loadSettings(userData).theme).toBe('light')
  })

  it('never overwrites a file written by a newer version', () => {
    const newer = JSON.stringify({ version: PREFERENCES_VERSION + 1, settings: { theme: 'dark' }, extra: 1 })
    writeFileSync(preferencesPath(userData), newer, 'utf8')

    expect(loadSettings(userData)).toEqual(DEFAULTS)
    saveSettings(userData, { ...DEFAULTS, theme: 'light' } as never)
    expect(readFileSync(preferencesPath(userData), 'utf8')).toBe(newer)
  })

  it('treats a damaged preferences file as defaults, not as legacy settings', () => {
    writeFileSync(preferencesPath(userData), '{ not json', 'utf8')
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({ theme: 'dark' }), 'utf8')

    expect(loadSettings(userData)).toEqual(DEFAULTS)
  })

  it('accepts autosave intervals only as whole seconds within the allowed range', () => {
    const load = (value: unknown) => {
      writeFileSync(preferencesPath(userData), JSON.stringify({ version: 2, settings: { autosaveSeconds: value } }), 'utf8')
      return loadSettings(userData).autosaveSeconds
    }

    expect(load(30)).toBe(30)
    expect(load(1)).toBe(7)
    expect(load(500)).toBe(7)
    expect(load(2.5)).toBe(7)
    expect(load('10')).toBe(7)
  })
})

describe('migratePreferences', () => {
  it('reads an unversioned object as version 1 settings', () => {
    const result = migratePreferences({ spellCheck: false })

    expect(result).toMatchObject({ locked: false, upgraded: true })
    expect(result.settings.spellCheck).toBe(false)
  })

  it('reads the current layout without marking it for upgrade', () => {
    const result = migratePreferences({ version: PREFERENCES_VERSION, settings: { theme: 'dark' } })

    expect(result).toMatchObject({ locked: false, upgraded: false })
    expect(result.settings.theme).toBe('dark')
  })

  it('upgrades the previous layout and keeps its settings', () => {
    const result = migratePreferences({ version: 2, settings: { theme: 'dark' } })

    expect(result).toMatchObject({ locked: false, upgraded: true })
    expect(result.settings.theme).toBe('dark')
  })

  it('locks a file from a newer version', () => {
    expect(migratePreferences({ version: 99, settings: { theme: 'dark' } })).toMatchObject({
      locked: true
    })
  })

  it('gives defaults for anything that is not an object', () => {
    expect(migratePreferences(null).settings).toEqual(DEFAULTS)
    expect(migratePreferences([1, 2]).settings).toEqual(DEFAULTS)
    expect(migratePreferences('texte').settings).toEqual(DEFAULTS)
  })
})

describe('sanitizePreferencesPatch', () => {
  it('keeps valid changes only', () => {
    expect(
      sanitizePreferencesPatch({
        spellCheck: false,
        spellLanguage: 'en-GB',
        autosaveSeconds: 15,
        reopenLastDocument: false,
        theme: 'dark'
      })
    ).toEqual({ spellCheck: false, spellLanguage: 'en-GB', autosaveSeconds: 15, reopenLastDocument: false })
  })

  it('drops invalid values instead of resetting them', () => {
    expect(
      sanitizePreferencesPatch({ spellCheck: 'oui', spellLanguage: 'pas une langue!', autosaveSeconds: 1000 })
    ).toEqual({})
    expect(sanitizePreferencesPatch(null)).toEqual({})
  })
})
