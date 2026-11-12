import { Settings } from 'lucide-react'
import type { PageWidth, PreferencesView, ThemePreference } from '../../../shared/types'
import { SPELL_LANGUAGE_OPTIONS } from '../../../shared/spellLanguages'
import { WIDTHS } from './LayoutMenu'
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

const THEMES: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'Automatique (système)' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' }
]

/** Seconds offered for the recovery copy. The stored range is wider. */
const AUTOSAVE_CHOICES: Array<{ value: number; label: string }> = [
  { value: 3, label: '3 secondes' },
  { value: 7, label: '7 secondes (par défaut)' },
  { value: 15, label: '15 secondes' },
  { value: 30, label: '30 secondes' },
  { value: 60, label: '1 minute' }
]

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
            <h2 id="preferences-title">Préférences</h2>
            <p>Chaque réglage est appliqué et mémorisé immédiatement.</p>
          </div>
        </div>

        <fieldset className="preferences-group">
          <legend>Apparence</legend>
          <div className="preferences-radios" role="radiogroup" aria-label="Thème">
            {THEMES.map((option) => (
              <label key={option.value} className="preferences-option">
                <input
                  type="radio"
                  name="theme"
                  checked={theme === option.value}
                  onChange={() => onThemeChange(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          <label className="preferences-field">
            <span>Largeur de la page</span>
            <select value={pageWidth} onChange={(event) => onPageWidthChange(event.target.value as PageWidth)}>
              {WIDTHS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset className="preferences-group">
          <legend>Écriture</legend>
          <label className="preferences-option">
            <input
              type="checkbox"
              checked={preferences.spellCheck}
              onChange={(event) => onPreferencesChange({ spellCheck: event.target.checked })}
            />
            <span>Vérifier l’orthographe pendant la rédaction</span>
          </label>
          <label className="preferences-field">
            <span>Langue de vérification</span>
            <select
              value={preferences.spellLanguage}
              disabled={!preferences.spellCheck}
              onChange={(event) => onPreferencesChange({ spellLanguage: event.target.value })}
            >
              {SPELL_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="preferences-field">
            <span>Copie de secours toutes les</span>
            <select
              value={preferences.autosaveSeconds}
              onChange={(event) => onPreferencesChange({ autosaveSeconds: Number(event.target.value) })}
            >
              {/* Keep the stored value selectable even when it is not in the list. */}
              {!AUTOSAVE_CHOICES.some((option) => option.value === preferences.autosaveSeconds) && (
                <option value={preferences.autosaveSeconds}>{preferences.autosaveSeconds} secondes</option>
              )}
              {AUTOSAVE_CHOICES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset className="preferences-group">
          <legend>Démarrage</legend>
          <label className="preferences-option">
            <input
              type="checkbox"
              checked={preferences.reopenLastDocument}
              onChange={(event) => onPreferencesChange({ reopenLastDocument: event.target.checked })}
            />
            <span>Rouvrir le dernier document au lancement</span>
          </label>
        </fieldset>

        <div className="dialog-actions">
          <span className="dialog-spacer" />
          <button type="button" className="dialog-button dialog-button--primary" onClick={onClose}>
            Fermer
          </button>
        </div>
    </Modal>
  )
}
