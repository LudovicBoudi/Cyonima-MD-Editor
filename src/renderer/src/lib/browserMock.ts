import type { ElectronApi, FileFormat, LocaleState, ViewSettings } from '../../../shared/types'
import { resolveLanguage } from '../../../shared/i18n'
import { DEFAULT_SNIPPETS, DEFAULT_TEMPLATES } from '../../../shared/templates'
import { readStoredTheme, systemTheme, THEME_STORAGE_KEY } from './theme'
import { normalizeViewSettings, readStoredViewSettings, storeViewSettings } from './viewSettings'

const BROWSER_PREFERENCES = {
  reopenLastDocument: true,
  spellCheck: true,
  spellLanguage: 'fr-FR',
  autosaveSeconds: 7,
  language: 'system' as const
}

const SYSTEM_LOCALE =
  typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'fr-FR'

function browserLocale(): LocaleState {
  return {
    preference: BROWSER_PREFERENCES.language,
    language: resolveLanguage(BROWSER_PREFERENCES.language, SYSTEM_LOCALE),
    systemLocale: SYSTEM_LOCALE
  }
}

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

function download(name: string, content: string, type = 'text/markdown;charset=utf-8'): void {
  const blob = new Blob([content], { type })
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

  const viewListeners = new Set<(settings: ViewSettings) => void>()
  const localeListeners = new Set<(state: LocaleState) => void>()

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
    openFileAt: async () => ({ canceled: true }),
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
    setOpenPaths: () => undefined,
    closeWindow: () => window.close(),
    getLibrary: async () => ({
      templates: Object.entries(DEFAULT_TEMPLATES).map(([name, content]) => ({ name, content })),
      snippets: Object.entries(DEFAULT_SNIPPETS).map(([name, content]) => ({ name, content })),
      folder: ''
    }),
    openLibraryFolder: async () => undefined,
    importDocx: async () => ({ canceled: true }),
    openFolder: async () => null,
    getWorkspace: async () => null,
    closeWorkspace: async () => undefined,
    listHistory: async () => [],
    getPreferences: async () => ({ ...BROWSER_PREFERENCES }),
    setPreferences: async (patch) => {
      Object.assign(BROWSER_PREFERENCES, patch)
      if ('language' in patch) localeListeners.forEach((listener) => listener(browserLocale()))
      return { ...BROWSER_PREFERENCES }
    },
    onPreferencesChanged: () => () => undefined,
    getLocale: async () => browserLocale(),
    getAppInfo: async () => ({
      name: 'Cyonima MD Editor',
      version: '0.1.0',
      electron: '—',
      chromium: navigator.userAgent,
      node: '—',
      platform: navigator.platform
    }),
    onLocaleChanged: (callback) => {
      localeListeners.add(callback)
      return () => {
        localeListeners.delete(callback)
      }
    },
    readHistory: async () => null,
    exportHtml: async (request) => {
      const base = request.fileName.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '') || 'document'
      const name = askText('Nom du fichier HTML', `${base}.html`)
      if (!name) return { canceled: true }
      download(name, request.html, 'text/html;charset=utf-8')
      return { canceled: false, path: name }
    },
    exportPdf: async (request) => {
      // The browser preview prints through the system dialog, which offers PDF output.
      const frame = document.createElement('iframe')
      frame.setAttribute('aria-hidden', 'true')
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
      frame.srcdoc = request.html
      document.body.appendChild(frame)
      frame.onload = () => {
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
        window.setTimeout(() => frame.remove(), 1000)
      }
      return { canceled: false, path: request.fileName }
    },
    openExternal: async (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    writeClipboard: async (text) => {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        // Clipboard unavailable in this context — ignore.
      }
    },
    readClipboard: async () => {
      try {
        return await navigator.clipboard.readText()
      } catch {
        return ''
      }
    },
    getTheme: async () => ({
      preference: readStoredTheme(),
      resolved: systemTheme()
    }),
    setTheme: async (preference) => {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, preference)
      } catch {
        // Best-effort only.
      }
      return {
        preference,
        resolved: preference === 'system' ? systemTheme() : preference
      }
    },
    onThemeChanged: (callback) => {
      const query = window.matchMedia('(prefers-color-scheme: dark)')
      const listener = () =>
        callback({ preference: readStoredTheme(), resolved: query.matches ? 'dark' : 'light' })
      query.addEventListener('change', listener)
      return () => query.removeEventListener('change', listener)
    },
    getViewSettings: async () => readStoredViewSettings(),
    setViewSettings: async (patch) => {
      const next = normalizeViewSettings({ ...readStoredViewSettings(), ...patch })
      storeViewSettings(next)
      viewListeners.forEach((listener) => listener(next))
      return next
    },
    onViewSettingsChanged: (callback) => {
      viewListeners.add(callback)
      return () => {
        viewListeners.delete(callback)
      }
    },
    pickImage: async () => null,
    importImage: async () => null,
    importImageBuffer: async () => null,
    onMenuAction: () => () => undefined,
    onSaveAndClose: () => () => undefined,
    onDocumentReload: () => () => undefined,
    newWindow: async () => undefined,
    saveAutosave: async () => undefined,
    clearAutosave: async () => undefined,
    onNotify: () => () => undefined,
    log: () => undefined,
    onOpenFile: () => () => undefined,
    getPathForFile: () => ''
  }

  window.api = api
}
