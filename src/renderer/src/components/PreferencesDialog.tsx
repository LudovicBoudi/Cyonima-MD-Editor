import { Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  DefaultEditorResult,
  LanguagePreference,
  PageWidth,
  PreferencesView,
  ThemePreference,
  UpdateState
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
  const [defaultEditor, setDefaultEditor] = useState<DefaultEditorResult | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const spellOptions = spellLanguageOptions(language)

  useEffect(() => {
    let active = true
    void window.api.getUpdateState().then((state) => {
      if (active) setUpdateState(state)
    })
    const unsubscribe = window.api.onUpdateStatus(setUpdateState)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const themeKey = (value: ThemePreference) =>
    value === 'system' ? 'theme.system' : value === 'light' ? 'theme.light' : 'theme.dark'

  const widthKey = (value: PageWidth) => `layout.width.${value}` as const

  const setDefault = async () => {
    setDefaultEditor(await window.api.setDefaultEditor())
  }

  const updateMessage = updateState
    ? updateState.status === 'checking'
      ? t('prefs.updateChecking')
      : updateState.status === 'available'
        ? t('prefs.updateAvailable', { version: updateState.availableVersion ?? '…' })
        : updateState.status === 'downloading'
          ? t('prefs.updateDownloading', {
              version: updateState.availableVersion ?? '…',
              progress: Math.round(updateState.progress ?? 0)
            })
          : updateState.status === 'downloaded'
            ? t('prefs.updateDownloaded', { version: updateState.availableVersion ?? '…' })
            : updateState.status === 'not-available'
              ? t('prefs.updateNotAvailable')
              : updateState.status === 'error'
                ? t('prefs.updateError')
                : updateState.status === 'disabled'
                  ? t('prefs.updateDisabled')
                  : null
    : null

  const defaultEditorMessage = defaultEditor
    ? defaultEditor.status === 'configured'
      ? t('prefs.defaultEditorConfigured')
      : defaultEditor.status === 'settings'
        ? t('prefs.defaultEditorSettings')
        : t('prefs.defaultEditorManual')
    : null

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

      <fieldset className="preferences-group">
        <legend>{t('prefs.updates')}</legend>
        <label className="preferences-option">
          <input
            type="checkbox"
            checked={preferences.autoUpdate}
            onChange={(event) => onPreferencesChange({ autoUpdate: event.target.checked })}
          />
          <span>{t('prefs.autoUpdate')}</span>
        </label>
        <label className="preferences-field">
          <span>{t('prefs.updateChannel')}</span>
          <select
            value={preferences.updateChannel}
            onChange={(event) =>
              onPreferencesChange({
                updateChannel: event.target.value as PreferencesView['updateChannel']
              })
            }
          >
            <option value="stable">{t('prefs.channelStable')}</option>
            <option value="beta">{t('prefs.channelBeta')}</option>
          </select>
        </label>
        <p className="preferences-hint">{t('prefs.updateHint')}</p>
        <div className="preferences-actions">
          <button
            type="button"
            className="dialog-button"
            disabled={
              updateState?.status === 'checking' || updateState?.status === 'downloading'
            }
            onClick={() => void window.api.checkForUpdates().then(setUpdateState)}
          >
            {t('prefs.checkUpdates')}
          </button>
          {updateState?.status === 'downloaded' && (
            <button
              type="button"
              className="dialog-button dialog-button--primary"
              onClick={() => void window.api.installUpdate()}
            >
              {t('prefs.installUpdate')}
            </button>
          )}
          <button
            type="button"
            className="dialog-button"
            onClick={() => void window.api.openReleasesPage()}
          >
            {t('prefs.previousVersions')}
          </button>
        </div>
        {updateMessage && (
          <p className="preferences-hint" role="status">
            {updateMessage}
          </p>
        )}
        {updateState?.releaseNotes && (
          <details className="preferences-update-notes">
            <summary>{t('prefs.releaseNotes')}</summary>
            <pre>{updateState.releaseNotes}</pre>
          </details>
        )}
      </fieldset>

      <fieldset className="preferences-group">
        <legend>{t('prefs.files')}</legend>
        <p className="preferences-hint">{t('prefs.defaultEditorHint')}</p>
        <div className="preferences-actions">
          <button type="button" className="dialog-button" onClick={() => void setDefault()}>
            {t('prefs.defaultEditor')}
          </button>
        </div>
        {defaultEditorMessage && (
          <p className="preferences-hint" role="status">
            {defaultEditorMessage}
          </p>
        )}
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
