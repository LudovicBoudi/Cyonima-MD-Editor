import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  createTranslator,
  languageDirection,
  localeTag,
  resolveLanguage
} from '../../../shared/i18n'
import type { Translator } from '../../../shared/i18n'
import type { Language, LanguagePreference, LocaleState } from '../../../shared/types'

export interface I18nValue {
  /** Interface language actually displayed. */
  language: Language
  /** Stored preference (`system`, `fr` or `en`). */
  preference: LanguagePreference
  /** System locale reported by the main process. */
  systemLocale: string
  /** BCP 47 tag for dates and numbers. */
  locale: string
  t: Translator
}

const SYSTEM_LOCALE =
  typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'fr-FR'

/**
 * Fallback used before the main process answers, and by components rendered
 * outside the provider. It follows the system language immediately so the
 * first paint is already in the right language.
 */
const FALLBACK_LANGUAGE = resolveLanguage('system', SYSTEM_LOCALE)

const FALLBACK: I18nValue = {
  language: FALLBACK_LANGUAGE,
  preference: 'system',
  systemLocale: SYSTEM_LOCALE,
  locale: localeTag(FALLBACK_LANGUAGE, SYSTEM_LOCALE),
  t: createTranslator(FALLBACK_LANGUAGE)
}

/** Shared with class components (ErrorBoundary) through `contextType`. */
export const I18nContext = createContext<I18nValue>(FALLBACK)

function valueFromState(state: LocaleState): I18nValue {
  return {
    language: state.language,
    preference: state.preference,
    systemLocale: state.systemLocale,
    locale: localeTag(state.language, state.systemLocale),
    t: createTranslator(state.language)
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LocaleState>(() => ({
    preference: 'system',
    language: FALLBACK_LANGUAGE,
    systemLocale: SYSTEM_LOCALE
  }))

  useEffect(() => {
    let active = true

    void window.api
      .getLocale()
      .then((next) => {
        if (active) setState(next)
      })
      .catch(() => {
        // The French/system fallback is already usable: keep it.
      })

    const unsubscribe = window.api.onLocaleChanged((next) => setState(next))
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const value = useMemo(() => valueFromState(state), [state])

  useEffect(() => {
    const root = document.documentElement
    root.lang = value.locale
    root.dir = languageDirection(value.language)
  }, [value.locale, value.language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/** Translation helper for renderer components. */
export function useI18n(): I18nValue {
  return useContext(I18nContext)
}
