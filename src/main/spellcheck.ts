import type { ContextMenuParams, MenuItemConstructorOptions, Session } from 'electron'

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

const MAX_SUGGESTIONS = 6

/**
 * Applies the spell-checking settings to the session and returns the language
 * actually in use. An unavailable language falls back to `fallback`, so the
 * checker never silently runs with a language the user did not pick.
 */
export function applySpellcheck(
  session: Session,
  settings: { spellCheck: boolean; spellLanguage: string },
  fallback: string
): string {
  session.setSpellCheckerEnabled(settings.spellCheck)
  const available = session.availableSpellCheckerLanguages
  const language = available.includes(settings.spellLanguage) ? settings.spellLanguage : fallback
  if (available.includes(language)) session.setSpellCheckerLanguages([language])
  return language
}

export interface ContextMenuHandlers {
  replaceWord: (word: string) => void
  addWord: (word: string) => void
}

/**
 * Context menu shown on right-click: spelling suggestions first when the click
 * lands on a misspelled word, then the usual editing commands.
 */
export function buildContextMenu(
  params: Pick<
    ContextMenuParams,
    'misspelledWord' | 'dictionarySuggestions' | 'isEditable' | 'selectionText' | 'editFlags'
  >,
  handlers: ContextMenuHandlers
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = []
  const word = params.misspelledWord

  if (word) {
    const suggestions = params.dictionarySuggestions.slice(0, MAX_SUGGESTIONS)
    if (suggestions.length > 0) {
      for (const suggestion of suggestions) {
        items.push({ label: suggestion, click: () => handlers.replaceWord(suggestion) })
      }
    } else {
      items.push({ label: 'Aucune suggestion', enabled: false })
    }
    items.push(
      { label: `Ajouter « ${word} » au dictionnaire`, click: () => handlers.addWord(word) },
      { type: 'separator' }
    )
  }

  if (params.isEditable) {
    const flags = params.editFlags
    items.push(
      { role: 'cut', label: 'Couper', enabled: flags.canCut },
      { role: 'copy', label: 'Copier', enabled: flags.canCopy },
      { role: 'paste', label: 'Coller', enabled: flags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', label: 'Tout sélectionner', enabled: flags.canSelectAll }
    )
  } else if (params.selectionText) {
    items.push({ role: 'copy', label: 'Copier' })
  }

  while (items.length > 0 && items[items.length - 1].type === 'separator') items.pop()
  return items
}
