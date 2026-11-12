import { Settings } from 'lucide-react'
import type {
  LanguagePreference,
  PageWidth,
  PreferencesView,
  ThemePreference
} from '../../../shared/types'
import { spellLanguageOptions } from '../../../shared/spellLanguages'
import { useI18n } from '../lib/i18n'
import { Modal } from './Modal'

interface PreferencesDialogProps {
  preferences: PreferencesView
  theme: ThemePreference
  pageWidth: PageWidth
  onPreferencesChange: (patch: Partial<PreferencesView>) => void
  onThemeChange: (theme: ThemePreference) => void
  onPageWidthChange: (width: PageWidth) => void
  onClose: () => void
}

const THEMES: ThemePreference[] = ['system', 'light', 'dark']
const PAGE_WIDTHS: PageWidth[] = ['narrow', 'normal', 'wide', 'full']
const LANGUAGES: LanguagePreference[] = ['system', 'fr', 'en']

/** Seconds offered for the recovery copy. The stored range is wider. */
const AUTOSAVE_CHOICES = [3, 7, 15, 30, 60] as const

/**
 * Settings screen. Each control applies at once and is stored straight away,
 * so there is no separate "save" step to forget.
 */
export function PreferencesDialog({
  preferences,
  theme,
  pageWidth,
  onPreferencesChange,
  onThemeChange,
  onPageWidthChange,
  onClose
}: PreferencesDialogProps) {
  const { t, language } = useI18n()
  const spellOptions = spellLanguageOptions(language)

  const themeKey = (value: ThemePreference) =>
    value === 'system' ? 'theme.system' : value === 'light' ? 'theme.light' : 'theme.dark'

  const widthKey = (value: PageWidth) => `layout.width.${value}` as const

  const languageLabel = (value: LanguagePreference) =>
    value === 'system'
      ? t('prefs.languageSystem')
      : value === 'fr'
        ? t('prefs.languageFr')
        : t('prefs.languageEn')

  return (
    <Modal
      labelledBy="preferences-title"
      className="preferences-dialog"
      onClose={onClose}
      closeOnBackdrop
    >
      <div className="dialog-heading">
        <span className="dialog-icon">
          <Settings size={18} strokeWidth={1.9} />
        </span>
        <div>
          <h2 id="preferences-title">{t('prefs.title')}</h2>
          <p>{t('prefs.subtitle')}</p>
        </div>
      </div>

      <fieldset className="preferences-group">
        <legend>{t('prefs.appearance')}</legend>
        <div className="preferences-radios" role="radiogroup" aria-label={t('prefs.theme')}>
          {THEMES.map((value) => (
            <label key={value} className="preferences-option">
              <input
                type="radio"
                name="theme"
                checked={theme === value}
                onChange={() => onThemeChange(value)}
              />
              <span>{t(themeKey(value))}</span>
            </label>
          ))}
        </div>
        <label className="preferences-field">
          <span>{t('prefs.pageWidth')}</span>
          <select
            value={pageWidth}
            onChange={(event) => onPageWidthChange(event.target.value as PageWidth)}
          >
            {PAGE_WIDTHS.map((value) => (
              <option key={value} value={value}>
                {t(widthKey(value))}
              </option>
            ))}
          </select>
        </label>
        <label className="preferences-field">
          <span>{t('prefs.language')}</span>
          <select
            value={preferences.language}
            onChange={(event) =>
              onPreferencesChange({
                language: event.target.value as LanguagePreference
              })
            }
          >
            {LANGUAGES.map((value) => (
              <option key={value} value={value}>
                {languageLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="preferences-group">
        <legend>{t('prefs.writing')}</legend>
        <label className="preferences-option">
          <input
            type="checkbox"
            checked={preferences.spellCheck}
            onChange={(event) => onPreferencesChange({ spellCheck: event.target.checked })}
          />
          <span>{t('prefs.spellCheck')}</span>
        </label>
        <label className="preferences-field">
          <span>{t('prefs.spellLanguage')}</span>
          <select
            value={preferences.spellLanguage}
            disabled={!preferences.spellCheck}
            onChange={(event) => onPreferencesChange({ spellLanguage: event.target.value })}
          >
            {spellOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="preferences-field">
          <span>{t('prefs.autosaveEvery')}</span>
          <select
            value={preferences.autosaveSeconds}
            onChange={(event) =>
              onPreferencesChange({ autosaveSeconds: Number(event.target.value) })
            }
          >
            {/* Keep the stored value selectable even when it is not in the list. */}
            {!AUTOSAVE_CHOICES.some((value) => value === preferences.autosaveSeconds) && (
              <option value={preferences.autosaveSeconds}>
                {t('prefs.autosaveSecondsCustom', { count: preferences.autosaveSeconds })}
              </option>
            )}
            {AUTOSAVE_CHOICES.map((value) => (
              <option key={value} value={value}>
                {value === 7
                  ? t('prefs.autosaveSecondsDefault', { count: value })
                  : value === 60
                    ? t('common.minute', { count: 1 })
                    : t('prefs.autosaveSecondsCustom', { count: value })}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="preferences-group">
        <legend>{t('prefs.startup')}</legend>
        <label className="preferences-option">
          <input
            type="checkbox"
            checked={preferences.reopenLastDocument}
            onChange={(event) => onPreferencesChange({ reopenLastDocument: event.target.checked })}
          />
          <span>{t('prefs.reopen')}</span>
        </label>
      </fieldset>

      <div className="dialog-actions">
        <span className="dialog-spacer" />
        <button type="button" className="dialog-button dialog-button--primary" onClick={onClose}>
          {t('prefs.close')}
        </button>
      </div>
    </Modal>
  )
}
