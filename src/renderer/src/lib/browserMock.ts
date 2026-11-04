import type { ElectronApi, FileFormat } from '../../../shared/types'

const DEFAULT_FORMAT: FileFormat = {
  encoding: 'utf-8',
  bom: false,
  eol: typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent) ? 'crlf' : 'lf'
}

const SAMPLE_DOCUMENT = `---
title: Bienvenue dans Cyonima MD Editor
author: Cyonima
---

# Bienvenue dans Cyonima MD Editor

Un éditeur **WYSIWYG** pour vos documents *Markdown* : vous écrivez ce que vous voyez, et le fichier reste du Markdown propre et lisible.

## Un éditeur, pas un aperçu

Fini le duo fenêtre source / fenêtre rendu. Mettez en forme avec la barre d'outils, les raccourcis clavier — ou directement avec la syntaxe Markdown, qui reste comprise.

- **Gras**, *italique*, souligné et ~~barré~~ en un clic
- Titres, listes, citations et blocs de code
- Tableaux éditables et liens
- Ouverture et enregistrement de fichiers \`.md\`

> Le Markdown reste la source de vérité : ce que vous enregistrez est un fichier texte simple, portable et versionnable.

### Une liste de tâches

- [x] Installer l'éditeur
- [x] Écrire un premier document
- [ ] Relire et partager
- [ ] Publier sur le web

## Un tableau pour comparer

| Fonction | Word | Cyonima MD |
| --- | --- | --- |
| Fichier ouvert | DOCX | Markdown |
| Versionnage | Difficile | Natif (Git) |
| Portable | Non | Oui |
| Mise en forme | Riche | Riche |

## Du code, sans quitter le document

\`\`\`ts
function greet(name: string): string {
  return \`Bonjour, \${name} !\`
}

console.log(greet('Cyonima'))
\`\`\`

---

Enregistrez avec \`Ctrl+S\`, ouvrez un fichier existant avec \`Ctrl+O\`, et retrouvez vos documents où vous les avez laissés.

**Bonne écriture.**
`

function pickFile(): Promise<{ name: string; content: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => resolve({ name: file.name, content: String(reader.result ?? '') })
      reader.onerror = () => resolve(null)
      reader.readAsText(file)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

function askText(message: string, fallback: string): string {
  try {
    return window.prompt(message, fallback) ?? ''
  } catch {
    return fallback
  }
}

function askConfirm(message: string): boolean {
  try {
    return window.confirm(message)
  } catch {
    return true
  }
}

function download(name: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Development-only fallback so the renderer can be previewed in a regular
 * browser (`electron-vite dev --rendererOnly`). Never installed when the
 * Electron preload API is available.
 */
export function installBrowserMock(): void {
  if (window.api) return

  const api: ElectronApi = {
    getInitialDocument: async () => ({
      path: null,
      name: 'Bienvenue.md',
      content: SAMPLE_DOCUMENT,
      format: DEFAULT_FORMAT,
      defaultFormat: DEFAULT_FORMAT
    }),
    openFile: async () => {
      const file = await pickFile()
      if (!file) return { canceled: true }
      return {
        canceled: false,
        path: file.name,
        name: file.name,
        content: file.content,
        format: DEFAULT_FORMAT
      }
    },
    saveFile: async (request) => {
      const currentName = request.path?.split('/').pop() ?? 'document.md'
      const name =
        request.saveAs || !request.path
          ? askText('Nom du fichier Markdown', currentName)
          : currentName

      if (!name) return { canceled: true }
      download(name, request.content)
      return { canceled: false, path: name, name }
    },
    confirmDiscard: async () =>
      askConfirm('Abandonner les modifications non enregistrées ?') ? 'discard' : 'cancel',
    setDocumentMeta: () => undefined,
    closeWindow: () => window.close(),
    openExternal: async (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    onMenuAction: () => () => undefined,
    onSaveAndClose: () => () => undefined,
    onDocumentReload: () => () => undefined
  }

  window.api = api
}
