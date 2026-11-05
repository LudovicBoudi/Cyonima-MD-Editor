import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PageWidth, ThemePreference, ViewSettings } from '../shared/types'
import { DEFAULT_TYPOGRAPHY, normalizeTypography } from '../shared/typography'

export interface AppSettings extends ViewSettings {
  /** Reopen the most recent document when the app starts with no file argument. */
  reopenLastDocument: boolean
  /** Light, dark, or follow the operating system. */
  theme: ThemePreference
}

const DEFAULTS: AppSettings = {
  reopenLastDocument: true,
  theme: 'system',
  focusMode: false,
  pageWidth: 'normal',
  typewriterMode: false,
  ...DEFAULT_TYPOGRAPHY
}

const THEME_VALUES: readonly ThemePreference[] = ['system', 'light', 'dark']
const PAGE_WIDTHS: readonly PageWidth[] = ['narrow', 'normal', 'wide', 'full']

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_VALUES as readonly string[]).includes(value)
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
      typeof raw?.typewriterMode === 'boolean' ? raw.typewriterMode : DEFAULTS.typewriterMode
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
