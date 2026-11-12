import type { Language } from './types'

export interface SpellLanguageOption {
  code: string
  label: string
}

/**
 * Spell-checking languages offered by the session. Codes are Chromium's tags;
 * labels are translated, while the codes themselves never change.
 */
export const SPELL_LANGUAGE_OPTIONS: readonly SpellLanguageOption[] = [
  { code: 'fr-FR', label: 'Français' },
  { code: 'en-US', label: 'Anglais (États-Unis)' },
  { code: 'en-GB', label: 'Anglais (Royaume-Uni)' },
  { code: 'de-DE', label: 'Allemand' },
  { code: 'es-ES', label: 'Espagnol' },
  { code: 'it-IT', label: 'Italien' },
  { code: 'pt-BR', label: 'Portugais (Brésil)' },
  { code: 'nl-NL', label: 'Néerlandais' }
]

const ENGLISH_LABELS: Record<string, string> = {
  'fr-FR': 'French',
  'en-US': 'English (United States)',
  'en-GB': 'English (United Kingdom)',
  'de-DE': 'German',
  'es-ES': 'Spanish',
  'it-IT': 'Italian',
  'pt-BR': 'Portuguese (Brazil)',
  'nl-NL': 'Dutch'
}

/** Same options with labels in the interface language. */
export function spellLanguageOptions(language: Language): SpellLanguageOption[] {
  if (language === 'fr') return SPELL_LANGUAGE_OPTIONS.map((option) => ({ ...option }))
  return SPELL_LANGUAGE_OPTIONS.map((option) => ({
    code: option.code,
    label: ENGLISH_LABELS[option.code] ?? option.code
  }))
}
