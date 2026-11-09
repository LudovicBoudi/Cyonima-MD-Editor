export interface ShortcutEntry {
  label: string
  keys: string
}

export interface ShortcutGroup {
  title: string
  entries: ShortcutEntry[]
}

/** Keyboard shortcuts actually bound in the menu, the editor, or the app. Ctrl is ⌘ on macOS. */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Fichier',
    entries: [
      { label: 'Nouveau document', keys: 'Ctrl+N' },
      { label: 'Ouvrir', keys: 'Ctrl+O' },
      { label: 'Enregistrer', keys: 'Ctrl+S' },
      { label: 'Enregistrer sous', keys: 'Ctrl+Maj+S' },
      { label: 'Imprimer / PDF', keys: 'Ctrl+P' }
    ]
  },
  {
    title: 'Édition',
    entries: [
      { label: 'Annuler', keys: 'Ctrl+Z' },
      { label: 'Rétablir', keys: 'Ctrl+Y' },
      { label: 'Rechercher et remplacer', keys: 'Ctrl+F' },
      { label: 'Insérer un lien', keys: 'Ctrl+K' },
      { label: 'Coller sans mise en forme', keys: 'Ctrl+Maj+V' }
    ]
  },
  {
    title: 'Mise en forme',
    entries: [
      { label: 'Gras', keys: 'Ctrl+B' },
      { label: 'Italique', keys: 'Ctrl+I' },
      { label: 'Souligné', keys: 'Ctrl+U' },
      { label: 'Barré', keys: 'Ctrl+Maj+X' },
      { label: 'Code en ligne', keys: 'Ctrl+E' },
      { label: 'Titre 1 à 4', keys: 'Ctrl+Alt+1 à 4' },
      { label: 'Liste à puces', keys: 'Ctrl+Maj+8' },
      { label: 'Liste numérotée', keys: 'Ctrl+Maj+7' },
      { label: 'Liste de tâches', keys: 'Ctrl+Maj+9' },
      { label: 'Citation', keys: 'Ctrl+Maj+B' },
      { label: 'Bloc de code', keys: 'Ctrl+Alt+C' },
      { label: 'Saut de ligne', keys: 'Maj+Entrée' }
    ]
  },
  {
    title: 'Affichage',
    entries: [
      { label: 'Mode concentration', keys: 'Ctrl+Maj+F' },
      { label: 'Basculer source Markdown / éditeur', keys: 'Ctrl+Maj+M' },
      { label: 'Quitter le mode concentration', keys: 'Échap' },
      { label: 'Aide-mémoire (ce panneau)', keys: 'Ctrl+/ ou F1' }
    ]
  }
]

/** Markdown the editor understands, typed while writing or found when opening a file. */
export const MARKDOWN_SYNTAX: readonly ShortcutEntry[] = [
  { label: 'Titre', keys: '# Titre' },
  { label: 'Liste à puces', keys: '- élément' },
  { label: 'Liste numérotée', keys: '1. élément' },
  { label: 'Liste de tâches', keys: '- [ ] à faire' },
  { label: 'Citation', keys: '> citation' },
  { label: 'Bloc de code', keys: '```js' },
  { label: 'Séparateur', keys: '---' },
  { label: 'Gras, italique, barré', keys: '**gras**  *italique*  ~~barré~~' },
  { label: 'Code en ligne', keys: '`code`' },
  { label: 'Lien', keys: '[texte](https://…)' },
  { label: 'Image', keys: '![alt](assets/image.png)' },
  { label: 'Souligné', keys: '<u>souligné</u>' },
  { label: 'Tableau', keys: '| A | B |  puis  | --- | --- |' },
  { label: 'Alignement de colonne', keys: ':---  :---:  ---:' },
  { label: 'Métadonnées', keys: '---  (bloc YAML en tête de fichier)  ---' }
]
