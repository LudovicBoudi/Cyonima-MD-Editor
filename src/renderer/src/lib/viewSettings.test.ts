import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_TYPOGRAPHY } from '../../../shared/typography'
import {
  DEFAULT_VIEW_SETTINGS,
  normalizeViewSettings,
  readStoredViewSettings,
  storeViewSettings,
  VIEW_SETTINGS_STORAGE_KEY
} from './viewSettings'

beforeEach(() => {
  window.localStorage.clear()
})

describe('view settings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(readStoredViewSettings()).toEqual(DEFAULT_VIEW_SETTINGS)
  })

  it('normalises invalid values to defaults', () => {
    expect(normalizeViewSettings(undefined)).toEqual(DEFAULT_VIEW_SETTINGS)
    expect(
      normalizeViewSettings({
        focusMode: 'yes',
        pageWidth: 'giant',
        typewriterMode: 1,
        fontFamily: 'comic',
        fontSize: 42,
        lineHeight: 0.2,
        paragraphSpacing: 9,
        wordGoal: 1.5
      })
    ).toEqual(DEFAULT_VIEW_SETTINGS)
  })

  it('reads stored settings and fills missing typography', () => {
    window.localStorage.setItem(
      VIEW_SETTINGS_STORAGE_KEY,
      JSON.stringify({ focusMode: true, pageWidth: 'wide', typewriterMode: true })
    )
    expect(readStoredViewSettings()).toEqual({
      ...DEFAULT_TYPOGRAPHY,
      focusMode: true,
      pageWidth: 'wide',
      typewriterMode: true,
      wordGoal: null
    })
  })

  it('falls back to defaults when the stored value is corrupt', () => {
    window.localStorage.setItem(VIEW_SETTINGS_STORAGE_KEY, '{ not json')
    expect(readStoredViewSettings()).toEqual(DEFAULT_VIEW_SETTINGS)
  })

  it('round-trips through store and read', () => {
    const settings = {
      focusMode: true,
      pageWidth: 'full' as const,
      typewriterMode: false,
      fontFamily: 'mono' as const,
      fontSize: 19,
      lineHeight: 1.85,
      paragraphSpacing: 1.3,
      wordGoal: 800
    }
    storeViewSettings(settings)
    expect(readStoredViewSettings()).toEqual(settings)
  })
})
