import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LANGUAGE,
  createTranslator,
  en,
  fr,
  interpolate,
  localeTag,
  pluralKey,
  resolveLanguage,
  translate
} from './i18n'

describe('resolveLanguage', () => {
  it('keeps an explicit preference', () => {
    expect(resolveLanguage('fr', 'en-US')).toBe('fr')
    expect(resolveLanguage('en', 'fr-FR')).toBe('en')
  })

  it('follows a French or English system locale', () => {
    expect(resolveLanguage('system', 'fr-FR')).toBe('fr')
    expect(resolveLanguage('system', 'fr-CA')).toBe('fr')
    expect(resolveLanguage('system', 'en-GB')).toBe('en')
    expect(resolveLanguage('system', 'en')).toBe('en')
  })

  it('falls back to French for other or missing system locales', () => {
    expect(DEFAULT_LANGUAGE).toBe('fr')
    expect(resolveLanguage('system', 'de-DE')).toBe('fr')
    expect(resolveLanguage('system', '')).toBe('fr')
    expect(resolveLanguage('system', null)).toBe('fr')
  })
})

describe('localeTag', () => {
  it('keeps a matching system locale and otherwise uses a standard tag', () => {
    expect(localeTag('en', 'en-GB')).toBe('en-GB')
    expect(localeTag('fr', 'fr-CA')).toBe('fr-CA')
    expect(localeTag('en', 'fr-FR')).toBe('en-US')
    expect(localeTag('fr')).toBe('fr-FR')
    expect(localeTag('en', null)).toBe('en-US')
  })
})

describe('translate', () => {
  it('interpolates named values and leaves unknown placeholders alone', () => {
    expect(interpolate('Page {page} sur {total}', { page: 1, total: 4 })).toBe('Page 1 sur 4')
    expect(interpolate('{known} {missing}', { known: 'ok' })).toBe('ok {missing}')
    expect(interpolate('no placeholders')).toBe('no placeholders')
  })

  it('translates in both languages', () => {
    expect(translate('fr', 'common.cancel')).toBe('Annuler')
    expect(translate('en', 'common.cancel')).toBe('Cancel')
    expect(translate('en', 'status.lineColumn', { line: 3, column: 12 })).toBe(
      'Line 3, col. 12'
    )
  })

  it('returns a reusable translator', () => {
    const t = createTranslator('en')
    expect(t('header.save')).toBe('Save')
    expect(t('tabs.close', { name: 'Notes.md' })).toBe('Close Notes.md')
  })

  it('selects plural keys', () => {
    expect(pluralKey('common.wordsOne', 'common.wordsOther', 1)).toBe('common.wordsOne')
    expect(pluralKey('common.wordsOne', 'common.wordsOther', 2)).toBe('common.wordsOther')
  })
})

describe('dictionaries', () => {
  it('have the same keys and no empty value', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort())
    for (const [key, value] of Object.entries(en)) {
      expect(value.trim(), key).not.toBe('')
    }
  })
})
