import type { PageWidth, ViewSettings } from '../../../shared/types'
import { DEFAULT_TYPOGRAPHY, normalizeTypography } from '../../../shared/typography'

/** Mirrors view settings in the browser preview; Electron persists them in settings.json. */
export const VIEW_SETTINGS_STORAGE_KEY = 'cyonima-view-settings'

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  ...DEFAULT_TYPOGRAPHY,
  focusMode: false,
  pageWidth: 'normal',
  typewriterMode: false
}

const PAGE_WIDTHS: readonly PageWidth[] = ['narrow', 'normal', 'wide', 'full']

function isPageWidth(value: unknown): value is PageWidth {
  return typeof value === 'string' && (PAGE_WIDTHS as readonly string[]).includes(value)
}

export function normalizeViewSettings(raw: unknown): ViewSettings {
  const value = (raw ?? {}) as Partial<ViewSettings>
  return {
    ...normalizeTypography(value),
    focusMode:
      typeof value.focusMode === 'boolean' ? value.focusMode : DEFAULT_VIEW_SETTINGS.focusMode,
    pageWidth: isPageWidth(value.pageWidth) ? value.pageWidth : DEFAULT_VIEW_SETTINGS.pageWidth,
    typewriterMode:
      typeof value.typewriterMode === 'boolean'
        ? value.typewriterMode
        : DEFAULT_VIEW_SETTINGS.typewriterMode
  }
}

export function readStoredViewSettings(): ViewSettings {
  try {
    const raw = window.localStorage.getItem(VIEW_SETTINGS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_VIEW_SETTINGS }
    return normalizeViewSettings(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_VIEW_SETTINGS }
  }
}

export function storeViewSettings(settings: ViewSettings): void {
  try {
    window.localStorage.setItem(VIEW_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // The Electron settings file remains the source of truth.
  }
}
