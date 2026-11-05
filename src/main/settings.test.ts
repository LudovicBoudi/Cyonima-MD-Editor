import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_TYPOGRAPHY } from '../shared/typography'
import {
  isPageWidth,
  isThemePreference,
  loadSettings,
  normalizeViewSettings,
  saveSettings,
  settingsPath
} from './settings'

let userData: string

const DEFAULTS = {
  reopenLastDocument: true,
  theme: 'system',
  spellCheck: true,
  spellLanguage: 'fr-FR',
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
    writeFileSync(settingsPath(userData), '{ not json', 'utf8')
    expect(loadSettings(userData)).toEqual(DEFAULTS)
  })

  it('normalises invalid spelling settings', () => {
    writeFileSync(
      settingsPath(userData),
      JSON.stringify({ spellCheck: 'no', spellLanguage: 'not a language!' }),
      'utf8'
    )
    expect(loadSettings(userData)).toEqual(DEFAULTS)
  })

  it('merges partial settings over defaults', () => {
    writeFileSync(settingsPath(userData), JSON.stringify({ reopenLastDocument: false }), 'utf8')
    expect(loadSettings(userData)).toEqual({ ...DEFAULTS, reopenLastDocument: false })
  })

  it('round-trips through save and load', () => {
    saveSettings(userData, {
      reopenLastDocument: false,
      theme: 'dark',
      spellCheck: false,
      spellLanguage: 'en-GB',
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
    writeFileSync(settingsPath(userData), JSON.stringify({ theme: 'neon' }), 'utf8')
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
