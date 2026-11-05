import type { ResolvedTheme, ThemePreference } from '../../../shared/types'

/** Mirrors the theme preference in the browser preview; Electron persists it in settings.json. */
export const THEME_STORAGE_KEY = 'cyonima-theme'

export function systemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function readStoredTheme(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    // Storage unavailable — follow the system theme.
  }
  return 'system'
}

/**
 * Best-effort theme used before React mounts, so the first paint already has
 * the right colours. In Electron `matchMedia` already reflects nativeTheme.
 */
export function previewTheme(): ResolvedTheme {
  const preference = readStoredTheme()
  return preference === 'system' ? systemTheme() : preference
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved
}
