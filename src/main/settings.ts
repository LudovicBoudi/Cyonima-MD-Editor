import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  LanguagePreference,
  PageWidth,
  PreferencesView,
  ThemePreference,
  ViewSettings
} from '../shared/types'
import { DEFAULT_TYPOGRAPHY, normalizeTypography } from '../shared/typography'
import { normalizeWordGoal } from '../shared/wordGoal'

export interface AppSettings extends ViewSettings {
  /** Reopen the most recent document when the app starts with no file argument. */
  reopenLastDocument: boolean
  /** Light, dark, or follow the operating system. */
  theme: ThemePreference
  /** Underline misspelled words while writing. */
  spellCheck: boolean
  /** Spell-checking language tag, such as `fr-FR`. */
  spellLanguage: string
  /** Seconds between two recovery copies while there are unsaved changes. */
  autosaveSeconds: number
  /** Interface language, or the operating system language. */
  language: LanguagePreference
}

export const DEFAULT_SPELL_LANGUAGE = 'fr-FR'
export const DEFAULT_LANGUAGE_PREFERENCE: LanguagePreference = 'system'

/**
 * Version of the `preferences.json` layout. Version 1 was the unversioned
 * `settings.json`; each change of layout bumps this number and gets a branch
 * in `migratePreferences`.
 */
export const PREFERENCES_VERSION = 3

const PREFERENCES_FILE = 'preferences.json'
const LEGACY_SETTINGS_FILE = 'settings.json'

export const AUTOSAVE_SECONDS_MIN = 2
export const AUTOSAVE_SECONDS_MAX = 120

const DEFAULTS: AppSettings = {
  reopenLastDocument: true,
  theme: 'system',
  spellCheck: true,
  spellLanguage: DEFAULT_SPELL_LANGUAGE,
  autosaveSeconds: 7,
  language: DEFAULT_LANGUAGE_PREFERENCE,
  focusMode: false,
  pageWidth: 'normal',
  typewriterMode: false,
  wordGoal: null,
  ...DEFAULT_TYPOGRAPHY
}

const THEME_VALUES: readonly ThemePreference[] = ['system', 'light', 'dark']
const PAGE_WIDTHS: readonly PageWidth[] = ['narrow', 'normal', 'wide', 'full']

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_VALUES as readonly string[]).includes(value)
}

/** Accepts BCP 47-style tags such as `fr`, `fr-FR` or `en-GB`. */
export function isSpellLanguage(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(value)
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'system' || value === 'fr' || value === 'en'
}

export function isPageWidth(value: unknown): value is PageWidth {
  return typeof value === 'string' && (PAGE_WIDTHS as readonly string[]).includes(value)
}

export function normalizeAutosaveSeconds(value: unknown): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= AUTOSAVE_SECONDS_MIN &&
    value <= AUTOSAVE_SECONDS_MAX
    ? value
    : DEFAULTS.autosaveSeconds
}

/** Keeps only known, well-typed view settings. */
export function normalizeViewSettings(raw: Partial<ViewSettings> | undefined): ViewSettings {
  return {
    ...normalizeTypography(raw),
    focusMode: typeof raw?.focusMode === 'boolean' ? raw.focusMode : DEFAULTS.focusMode,
    pageWidth: isPageWidth(raw?.pageWidth) ? raw.pageWidth : DEFAULTS.pageWidth,
    typewriterMode:
      typeof raw?.typewriterMode === 'boolean' ? raw.typewriterMode : DEFAULTS.typewriterMode,
    wordGoal: normalizeWordGoal(raw?.wordGoal)
  }
}

/** Every setting, with invalid or missing values replaced by their defaults. */
export function normalizeSettings(raw: Record<string, unknown> | null | undefined): AppSettings {
  const value = raw ?? {}
  return {
    ...normalizeViewSettings(value as Partial<ViewSettings>),
    reopenLastDocument:
      typeof value.reopenLastDocument === 'boolean'
        ? value.reopenLastDocument
        : DEFAULTS.reopenLastDocument,
    theme: isThemePreference(value.theme) ? value.theme : DEFAULTS.theme,
    spellCheck: typeof value.spellCheck === 'boolean' ? value.spellCheck : DEFAULTS.spellCheck,
    spellLanguage: isSpellLanguage(value.spellLanguage)
      ? value.spellLanguage
      : DEFAULTS.spellLanguage,
    autosaveSeconds: normalizeAutosaveSeconds(value.autosaveSeconds),
    language: isLanguagePreference(value.language) ? value.language : DEFAULTS.language
  }
}

/**
 * Only the valid fields of a change coming from the renderer. Invalid values
 * are dropped rather than replaced, so a bad request cannot reset a setting.
 */
export function sanitizePreferencesPatch(patch: unknown): Partial<PreferencesView> {
  const value = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>
  const changes: Partial<PreferencesView> = {}

  if (typeof value.reopenLastDocument === 'boolean') {
    changes.reopenLastDocument = value.reopenLastDocument
  }
  if (typeof value.spellCheck === 'boolean') changes.spellCheck = value.spellCheck
  if (isSpellLanguage(value.spellLanguage)) changes.spellLanguage = value.spellLanguage
  if (normalizeAutosaveSeconds(value.autosaveSeconds) === value.autosaveSeconds) {
    changes.autosaveSeconds = value.autosaveSeconds
  }
  if (isLanguagePreference(value.language)) changes.language = value.language
  return changes
}

/** The preferences the settings screen edits directly. */
export function pickPreferences(settings: AppSettings): PreferencesView {
  return {
    reopenLastDocument: settings.reopenLastDocument,
    spellCheck: settings.spellCheck,
    spellLanguage: settings.spellLanguage,
    autosaveSeconds: settings.autosaveSeconds,
    language: settings.language
  }
}

export interface MigrationResult {
  settings: AppSettings
  /** True when the stored file is newer than this build: it must not be overwritten. */
  locked: boolean
  /** True when the stored file uses an older layout and should be rewritten. */
  upgraded: boolean
}

/**
 * Reads any stored preferences layout into the current settings. Unknown or
 * damaged content gives defaults; a file from a newer version is read with
 * defaults and locked, so an older build never overwrites it.
 */
export function migratePreferences(raw: unknown): MigrationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { settings: normalizeSettings({}), locked: false, upgraded: false }
  }

  const record = raw as Record<string, unknown>
  const version = record.version
  if (typeof version === 'number' && version > PREFERENCES_VERSION) {
    return { settings: normalizeSettings({}), locked: true, upgraded: false }
  }
  const stored = record.settings
  if (version === PREFERENCES_VERSION) {
    return {
      settings: normalizeSettings(
        stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}
      ),
      locked: false,
      upgraded: false
    }
  }

  // Older versioned layout: settings live under `settings`.
  if (typeof version === 'number' && stored && typeof stored === 'object') {
    return {
      settings: normalizeSettings(stored as Record<string, unknown>),
      locked: false,
      upgraded: true
    }
  }

  // Version 1, or no version at all: the object itself holds the settings.
  return { settings: normalizeSettings(record), locked: false, upgraded: true }
}

export function preferencesPath(userData: string): string {
  return join(userData, PREFERENCES_FILE)
}

/** Set when the stored file comes from a newer build: writes are refused. */
let writable = true

interface StoredFile {
  found: boolean
  value: unknown
}

function readStored(filePath: string): StoredFile {
  try {
    return { found: true, value: JSON.parse(readFileSync(filePath, 'utf8')) }
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
    // A damaged file counts as found: defaults apply, the legacy file is not used.
    return { found: !missing, value: null }
  }
}

export function loadSettings(userData: string): AppSettings {
  const current = readStored(preferencesPath(userData))
  if (current.found) {
    const result = migratePreferences(current.value)
    writable = !result.locked
    if (result.upgraded) saveSettings(userData, result.settings)
    return result.settings
  }

  // First start after the upgrade: the legacy settings are carried over. The
  // old file is left in place, so nothing is lost if the migration is undone.
  const legacy = readStored(join(userData, LEGACY_SETTINGS_FILE))
  writable = true
  if (legacy.found) {
    const result = migratePreferences(legacy.value)
    saveSettings(userData, result.settings)
    return result.settings
  }

  return normalizeSettings({})
}

export function saveSettings(userData: string, settings: AppSettings): void {
  if (!writable) return
  try {
    writeFileSync(
      preferencesPath(userData),
      JSON.stringify({ version: PREFERENCES_VERSION, settings }, null, 2),
      'utf8'
    )
  } catch {
    // Preferences are best-effort and never fatal.
  }
}
