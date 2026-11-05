import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PageWidth, ThemePreference, ViewSettings } from '../shared/types'
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
}

export const DEFAULT_SPELL_LANGUAGE = 'fr-FR'

const DEFAULTS: AppSettings = {
  reopenLastDocument: true,
  theme: 'system',
  spellCheck: true,
  spellLanguage: DEFAULT_SPELL_LANGUAGE,
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

export function isPageWidth(value: unknown): value is PageWidth {
  return typeof value === 'string' && (PAGE_WIDTHS as readonly string[]).includes(value)
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

export function settingsPath(userData: string): string {
  return join(userData, 'settings.json')
}

export function loadSettings(userData: string): AppSettings {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(userData), 'utf8'))
    const merged = { ...DEFAULTS, ...raw }
    return {
      ...merged,
      theme: isThemePreference(raw?.theme) ? raw.theme : DEFAULTS.theme,
      spellCheck: typeof raw?.spellCheck === 'boolean' ? raw.spellCheck : DEFAULTS.spellCheck,
      spellLanguage: isSpellLanguage(raw?.spellLanguage)
        ? raw.spellLanguage
        : DEFAULTS.spellLanguage,
      ...normalizeViewSettings(merged)
    }
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
