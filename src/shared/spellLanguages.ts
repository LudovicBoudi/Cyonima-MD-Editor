export interface SpellLanguageOption {
  code: string
  label: string
}

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
