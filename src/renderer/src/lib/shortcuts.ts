import { createTranslator } from '../../../shared/i18n'
import type { Translator } from '../../../shared/i18n'
import type { Language } from '../../../shared/types'

export interface ShortcutEntry {
  label: string
  keys: string
}

export interface ShortcutGroup {
  title: string
  entries: ShortcutEntry[]
}

interface GroupSpec {
  titleKey: Parameters<Translator>[0]
  entries: Array<[Parameters<Translator>[0], string]>
}

/** Keyboard shortcuts actually bound in the menu, the editor, or the app. */
const GROUPS: readonly GroupSpec[] = [
  {
    titleKey: 'shortcuts.group.file',
    entries: [
      ['shortcuts.newDocument', 'Ctrl+N'],
      ['shortcuts.newWindow', 'Ctrl+Maj+N'],
      ['shortcuts.open', 'Ctrl+O'],
      ['shortcuts.save', 'Ctrl+S'],
      ['shortcuts.saveAs', 'Ctrl+Maj+S'],
      ['shortcuts.print', 'Ctrl+P'],
      ['shortcuts.closeTab', 'Ctrl+W'],
      ['shortcuts.nextTab', 'Ctrl+Tab'],
      ['shortcuts.prevTab', 'Ctrl+Maj+Tab']
    ]
  },
  {
    titleKey: 'shortcuts.group.edit',
    entries: [
      ['shortcuts.undo', 'Ctrl+Z'],
      ['shortcuts.redo', 'Ctrl+Y'],
      ['shortcuts.find', 'Ctrl+F'],
      ['shortcuts.link', 'Ctrl+K'],
      ['shortcuts.pastePlain', 'Ctrl+Maj+V']
    ]
  },
  {
    titleKey: 'shortcuts.group.format',
    entries: [
      ['shortcuts.bold', 'Ctrl+B'],
      ['shortcuts.italic', 'Ctrl+I'],
      ['shortcuts.underline', 'Ctrl+U'],
      ['shortcuts.subscript', 'Ctrl+,'],
      ['shortcuts.superscript', 'Ctrl+.'],
      ['shortcuts.strike', 'Ctrl+Maj+X'],
      ['shortcuts.inlineCode', 'Ctrl+E'],
      ['shortcuts.heading1to4', 'Ctrl+Alt+1 à 4'],
      ['shortcuts.bulletList', 'Ctrl+Maj+8'],
      ['shortcuts.orderedList', 'Ctrl+Maj+7'],
      ['shortcuts.taskList', 'Ctrl+Maj+9'],
      ['shortcuts.quote', 'Ctrl+Maj+B'],
      ['shortcuts.codeBlock', 'Ctrl+Alt+C'],
      ['shortcuts.lineBreak', 'Maj+Entrée']
    ]
  },
  {
    titleKey: 'shortcuts.group.view',
    entries: [
      ['shortcuts.focusMode', 'Ctrl+Maj+F'],
      ['shortcuts.toggleSource', 'Ctrl+Maj+M'],
      ['shortcuts.exitFocus', 'Échap'],
      ['shortcuts.help', 'Ctrl+/ ou F1']
    ]
  }
]

const MARKDOWN: ReadonlyArray<[Parameters<Translator>[0], string]> = [
  ['shortcuts.md.heading', '# Titre'],
  ['shortcuts.md.bullet', '- élément'],
  ['shortcuts.md.ordered', '1. élément'],
  ['shortcuts.md.task', '- [ ] à faire'],
  ['shortcuts.md.quote', '> citation'],
  ['shortcuts.md.codeBlock', '```js'],
  ['shortcuts.md.rule', '---'],
  ['shortcuts.md.inline', '**gras**  *italique*  ~~barré~~'],
  ['shortcuts.md.inlineCode', '`code`'],
  ['shortcuts.md.link', '[texte](https://…)'],
  ['shortcuts.md.image', '![alt](assets/image.png)'],
  ['shortcuts.md.underline', '<u>souligné</u>'],
  ['shortcuts.md.table', '| A | B |  puis  | --- | --- |'],
  ['shortcuts.md.align', ':---  :---:  ---:'],
  ['shortcuts.md.frontmatter', '---  (bloc YAML en tête de fichier)  ---']
]

/**
 * English wording for the shortcut keys themselves. Ctrl stays Ctrl (⌘ on
 * macOS); only the modifier names and the Markdown examples change.
 */
const ENGLISH_KEYS: Readonly<Record<string, string>> = {
  'Ctrl+Maj+N': 'Ctrl+Shift+N',
  'Ctrl+Maj+S': 'Ctrl+Shift+S',
  'Ctrl+Maj+Tab': 'Ctrl+Shift+Tab',
  'Ctrl+Maj+V': 'Ctrl+Shift+V',
  'Ctrl+Maj+X': 'Ctrl+Shift+X',
  'Ctrl+Alt+1 à 4': 'Ctrl+Alt+1 to 4',
  'Ctrl+Maj+8': 'Ctrl+Shift+8',
  'Ctrl+Maj+7': 'Ctrl+Shift+7',
  'Ctrl+Maj+9': 'Ctrl+Shift+9',
  'Ctrl+Maj+B': 'Ctrl+Shift+B',
  'Maj+Entrée': 'Shift+Enter',
  'Ctrl+Maj+F': 'Ctrl+Shift+F',
  'Ctrl+Maj+M': 'Ctrl+Shift+M',
  Échap: 'Esc',
  'Ctrl+/ ou F1': 'Ctrl+/ or F1',
  '# Titre': '# Heading',
  '- élément': '- item',
  '1. élément': '1. item',
  '- [ ] à faire': '- [ ] to do',
  '> citation': '> quote',
  '**gras**  *italique*  ~~barré~~': '**bold**  *italic*  ~~strikethrough~~',
  '[texte](https://…)': '[text](https://…)',
  '<u>souligné</u>': '<u>underline</u>',
  '| A | B |  puis  | --- | --- |': '| A | B |  then  | --- | --- |',
  '---  (bloc YAML en tête de fichier)  ---': '---  (YAML block at the top of the file)  ---'
}

function localizeKeys(keys: string, language: Language): string {
  return language === 'en' ? (ENGLISH_KEYS[keys] ?? keys) : keys
}

/** Shortcut groups for the help sheet, translated for the current language. */
export function buildShortcutGroups(t: Translator, language: Language = 'fr'): ShortcutGroup[] {
  return GROUPS.map((group) => ({
    title: t(group.titleKey),
    entries: group.entries.map(([labelKey, keys]) => ({
      label: t(labelKey),
      keys: localizeKeys(keys, language)
    }))
  }))
}

/** Markdown syntax understood by the editor, translated for the current language. */
export function buildMarkdownSyntax(t: Translator, language: Language = 'fr'): ShortcutEntry[] {
  return MARKDOWN.map(([labelKey, keys]) => ({
    label: t(labelKey),
    keys: localizeKeys(keys, language)
  }))
}

/** French reference kept for tests and any non-React caller. */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = buildShortcutGroups(
  createTranslator('fr')
)
export const MARKDOWN_SYNTAX: readonly ShortcutEntry[] = buildMarkdownSyntax(
  createTranslator('fr')
)
