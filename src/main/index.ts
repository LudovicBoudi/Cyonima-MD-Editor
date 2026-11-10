import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  protocol,
  session,
  shell
} from 'electron'
import type { MenuItemConstructorOptions, MessageBoxSyncOptions } from 'electron'
import { statSync } from 'fs'
import { readFile, stat } from 'fs/promises'
import { basename, dirname, extname, join, resolve } from 'path'
import type {
  AutosaveRecord,
  AutosaveEntry,
  DiscardChoice,
  DocumentMeta,
  ExportHtmlRequest,
  ExportHtmlResult,
  ExportPdfRequest,
  ExportPdfResult,
  FileFormat,
  InitialDocument,
  LogLevel,
  MenuAction,
  NotifyLevel,
  OpenFileResult,
  PageWidth,
  ReloadDocumentPayload,
  SaveFileRequest,
  SaveFileResult,
  ThemePreference,
  ThemeState,
  HistoryVersion,
  PreferencesView,
  ViewSettings,
  WorkspaceState
} from '../shared/types'
import { decodeDocument, defaultFileFormat, encodeDocument } from './fileFormat'
import { writeFileAtomic } from './atomicWrite'
import { stampChanged } from './fileStamp'
import type { FileStamp } from './fileStamp'
import {
  clearAutosave,
  clearAutosaveSync,
  readAutosaveSync,
  writeAutosave
} from './autosave'
import { getLogFilePath, initLogger, log } from './logger'
import { addRecentFile, filterExistingFiles, loadRecentFiles, saveRecentFiles } from './recentFiles'
import {
  DEFAULT_SPELL_LANGUAGE,
  isThemePreference,
  loadSettings,
  normalizeSettings,
  pickPreferences,
  sanitizePreferencesPatch,
  normalizeViewSettings,
  saveSettings
} from './settings'
import type { AppSettings } from './settings'
import { importImageBuffer, importImageFile, IMAGE_EXTENSIONS, IMAGE_MIME } from './imageAssets'
import { embedLocalImages } from './embedImages'
import { renderPdf } from './pdfRender'
import { libraryRoot, loadLibrary } from './library'
import { findPandoc, importDocxFile } from './pandoc'
import { scanWorkspace } from './workspace'
import { listVersions, readVersion, recordVersion } from './history'
import type { LibraryState } from '../shared/types'
import { applySpellcheck, buildContextMenu, SPELL_LANGUAGE_OPTIONS } from './spellcheck'
import { DOCUMENT_FONT_OPTIONS, DEFAULT_TYPOGRAPHY, FONT_SIZE_MAX, FONT_SIZE_MIN } from '../shared/typography'

const APP_NAME = 'Cyonima MD Editor'

/** Window background colours used before the renderer has painted. */
const WINDOW_BACKGROUND = { light: '#eceae3', dark: '#171614' } as const

const PAGE_WIDTH_OPTIONS: Array<{ value: PageWidth; label: string }> = [
  { value: 'narrow', label: 'Étroite' },
  { value: 'normal', label: 'Normale' },
  { value: 'wide', label: 'Large' },
  { value: 'full', label: 'Pleine largeur' }
]

const FONT_SIZE_OPTIONS = Array.from(
  { length: FONT_SIZE_MAX - FONT_SIZE_MIN + 1 },
  (_, index) => FONT_SIZE_MIN + index
)
const LINE_HEIGHT_OPTIONS = [
  { value: 1.4, label: 'Serré' },
  { value: 1.7, label: 'Normal' },
  { value: 2, label: 'Aéré' }
] as const
const PARAGRAPH_SPACING_OPTIONS = [
  { value: 0.5, label: 'Compact' },
  { value: 1, label: 'Normal' },
  { value: 1.5, label: 'Aéré' }
] as const

function resolvedTheme(): 'light' | 'dark' {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

function themeState(): ThemeState {
  return { preference: settings.theme, resolved: resolvedTheme() }
}

function viewSettings(): ViewSettings {
  return {
    focusMode: settings.focusMode,
    pageWidth: settings.pageWidth,
    typewriterMode: settings.typewriterMode,
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    paragraphSpacing: settings.paragraphSpacing,
    wordGoal: settings.wordGoal
  }
}

function applySpellSettings(): void {
  const language = applySpellcheck(session.defaultSession, settings, DEFAULT_SPELL_LANGUAGE)
  log('info', 'Correction orthographique', {
    enabled: settings.spellCheck,
    language,
    available: session.defaultSession.availableSpellCheckerLanguages.length
  })
}

function setSpellSettings(patch: Partial<Pick<AppSettings, 'spellCheck' | 'spellLanguage'>>): void {
  settings = { ...settings, ...patch }
  saveSettings(app.getPath('userData'), settings)
  applySpellSettings()
  buildMenu()
}

function applyViewSettings(patch: Partial<ViewSettings>): ViewSettings {
  const next = normalizeViewSettings({ ...viewSettings(), ...patch })
  settings = { ...settings, ...next }
  saveSettings(app.getPath('userData'), settings)
  mainWindow?.webContents.send('view:changed', next)
  return next
}

function applyTheme(preference: ThemePreference): ThemeState {
  settings = { ...settings, theme: preference }
  nativeTheme.themeSource = preference
  saveSettings(app.getPath('userData'), settings)
  mainWindow?.setBackgroundColor(WINDOW_BACKGROUND[resolvedTheme()])
  const state = themeState()
  // Notify explicitly: changing themeSource does not always emit `updated`
  // (for example system → light while the OS is already light).
  mainWindow?.webContents.send('theme:changed', state)
  return state
}

// Allowed image extensions for the local file protocol and the image picker.
const IMAGE_FILTERS = [
  { name: 'Images', extensions: IMAGE_EXTENSIONS },
  { name: 'Tous les fichiers', extensions: ['*'] }
]
const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'txt']
const MARKDOWN_FILTERS = [
  { name: 'Documents Markdown', extensions: MARKDOWN_EXTENSIONS },
  { name: 'Tous les fichiers', extensions: ['*'] }
]

let mainWindow: BrowserWindow | null = null
let currentDocumentName = 'Sans titre'
let isDirty = false
let allowClose = false
let initialDocument: InitialDocument | null = null
let pendingEncodingWarning: string | null = null
let currentDocumentPath: string | null = null
let dirtyTabNames: string[] = []
/** Folder opened as a workspace. The renderer never names a path to list. */
let workspaceRoot: string | null = null
/** Last known on-disk state of every open file, by path, to detect outside changes. */
const knownStamps = new Map<string, FileStamp | null>()
let recentFiles: string[] = []
let settings: AppSettings = normalizeSettings({})

const gotSingleInstanceLock = app.requestSingleInstanceLock()

// Register a custom protocol so the renderer can safely load local image files
// using `local-file:///absolute/path/to/image.png` without needing to disable
// webSecurity or expose arbitrary file:// access.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-file',
    privileges: { secure: true, supportFetchAPI: true, corsEnabled: false }
  }
])

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }

    const filePath = extractFileArgument(commandLine.slice(process.defaultApp ? 2 : 1), workingDirectory)
    if (filePath) {
      mainWindow?.webContents.send('app:open-file', filePath)
    }
  })
}

/**
 * Extracts the first Markdown file path from a list of command-line arguments,
 * ignoring flags and resolving relative paths against an optional base
 * directory. Returns `null` when no existing Markdown file is found.
 */
function extractFileArgument(args: string[], baseDirectory?: string): string | null {
  for (const arg of args) {
    if (arg.startsWith('-')) continue

    const filePath = baseDirectory ? resolve(baseDirectory, arg) : resolve(arg)
    if (!MARKDOWN_EXTENSIONS.includes(extname(filePath).slice(1).toLowerCase())) continue

    try {
      if (statSync(filePath).isFile()) return filePath
    } catch {
      // Not an accessible file.
    }
  }
  return null
}

function findFileArgument(): string | null {
  return extractFileArgument(process.argv.slice(process.defaultApp ? 2 : 1))
}

async function readDocument(filePath: string): Promise<{
  content: string
  format: FileFormat
  fallback: boolean
}> {
  const buffer = await readFile(filePath)
  const decoded = decodeDocument(buffer)
  return { content: decoded.content, format: decoded.format, fallback: decoded.fallback }
}

function showEncodingWarning(fileName: string): void {
  const options: MessageBoxSyncOptions = {
    type: 'warning',
    buttons: ['Continuer'],
    defaultId: 0,
    noLink: true,
    message: 'Encodage non UTF-8 détecté',
    detail:
      `« ${fileName} » ne contient pas du texte UTF-8 valide. ` +
      'Il a été ouvert avec le décodage Windows-1252 pour éviter de remplacer des caractères. ' +
      'Le fichier sera enregistré en UTF-8.'
  }

  if (mainWindow) dialog.showMessageBoxSync(mainWindow, options)
  else dialog.showMessageBoxSync(options)
}

async function readStamp(filePath: string): Promise<FileStamp | null> {
  try {
    const info = await stat(filePath)
    return { mtimeMs: info.mtimeMs, size: info.size }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function reloadDocumentFromDisk(filePath: string): Promise<void> {
  const document = await readDocument(filePath)
  currentDocumentPath = filePath
  currentDocumentName = basename(filePath)
  knownStamps.set(filePath, await readStamp(filePath))

  const payload: ReloadDocumentPayload = {
    path: filePath,
    name: basename(filePath),
    content: document.content,
    format: document.format
  }
  mainWindow?.webContents.send('doc:reload', payload)

  if (document.fallback) showEncodingWarning(basename(filePath))
}

type ConflictResolution = 'overwrite' | 'reload' | 'save-as' | 'cancel'

function chooseAutosaveResolution(draft: AutosaveRecord): 'restore' | 'discard' {
  // Test-only seam: allows deterministic E2E verification of the recovery flow.
  const forced = process.env['CYONIMA_AUTOSAVE_CHOICE']
  if (forced === 'restore' || forced === 'discard') return forced

  const options: MessageBoxSyncOptions = {
    type: 'warning',
    buttons: ['Récupérer', 'Supprimer'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    message: 'Récupérer un brouillon non enregistré ?',
    detail:
      `Un brouillon non enregistré datant du ${new Date(draft.savedAt).toLocaleString('fr-FR')} a été trouvé. ` +
      '« Récupérer » le recharge ; « Supprimer » le définitivement efface.'
  }

  const choice = dialog.showMessageBoxSync(options)
  return choice === 0 ? 'restore' : 'discard'
}

function askConflictResolution(fileName: string): ConflictResolution {
  // Test-only seam: allows deterministic E2E verification of each branch.
  const forced = process.env['CYONIMA_CONFLICT_CHOICE']
  if (forced === 'overwrite' || forced === 'reload' || forced === 'save-as' || forced === 'cancel') {
    return forced
  }

  const options: MessageBoxSyncOptions = {
    type: 'warning',
    buttons: ['Recharger', 'Écraser', 'Enregistrer sous', 'Annuler'],
    defaultId: 1,
    cancelId: 3,
    noLink: true,
    message: 'Le fichier a été modifié en dehors de l’éditeur',
    detail:
      `« ${fileName} » a changé sur le disque depuis son ouverture. ` +
      '« Écraser » effacera ces modifications externes.'
  }

  const choice = mainWindow
    ? dialog.showMessageBoxSync(mainWindow, options)
    : dialog.showMessageBoxSync(options)

  switch (choice) {
    case 0:
      return 'reload'
    case 2:
      return 'save-as'
    case 3:
      return 'cancel'
    default:
      return 'overwrite'
  }
}

/** Lists the tabs with unsaved changes, for the close confirmation. */
function closeDetail(): string {
  const names = dirtyTabNames.length > 0 ? dirtyTabNames : [currentDocumentName]
  if (names.length === 1) return `« ${names[0]} » contient des modifications non enregistrées.`
  return `${names.length} documents contiennent des modifications non enregistrées : ${names.map((name) => `« ${name} »`).join(', ')}.`
}

function updateWindowTitle(): void {
  if (!mainWindow) return
  const marker = isDirty ? '• ' : ''
  mainWindow.setTitle(`${marker}${currentDocumentName} — ${APP_NAME}`)
}

function sendMenuAction(action: MenuAction): void {
  mainWindow?.webContents.send('menu:action', action)
}

const NOTIFY_TO_LOG: Record<NotifyLevel, LogLevel> = {
  info: 'info',
  success: 'info',
  warning: 'warn',
  error: 'error'
}

function notify(level: NotifyLevel, message: string): void {
  log(NOTIFY_TO_LOG[level], message)
  mainWindow?.webContents.send('app:notify', { level, message, at: Date.now() })
}

function rememberFile(filePath: string): void {
  recentFiles = addRecentFile(recentFiles, filePath)
  saveRecentFiles(app.getPath('userData'), recentFiles)
  buildMenu()
}

function openRecentFile(filePath: string): void {
  mainWindow?.webContents.send('app:open-file', filePath)
}

function buildRecentMenu(): MenuItemConstructorOptions[] {
  const existing = filterExistingFiles(recentFiles)
  if (existing.length !== recentFiles.length) {
    recentFiles = existing
    saveRecentFiles(app.getPath('userData'), recentFiles)
  }

  if (existing.length === 0) {
    return [{ label: 'Aucun fichier récent', enabled: false }]
  }

  const items: MenuItemConstructorOptions[] = existing.map((path) => ({
    label: basename(path),
    toolTip: path,
    click: () => openRecentFile(path)
  }))

  items.push({ type: 'separator' })
  items.push({
    label: 'Effacer la liste',
    click: () => {
      recentFiles = []
      saveRecentFiles(app.getPath('userData'), recentFiles)
      buildMenu()
    }
  })

  return items
}

async function exportHtml(request: ExportHtmlRequest): Promise<ExportHtmlResult> {
  if (!mainWindow) return { canceled: true }

  const baseName =
    request.fileName.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '').trim() || 'document'
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter en HTML',
    defaultPath: `${baseName}.html`,
    filters: [{ name: 'Page HTML', extensions: ['html', 'htm'] }]
  })

  if (result.canceled || !result.filePath) return { canceled: true }

  const targetPath = /\.html?$/i.test(result.filePath)
    ? result.filePath
    : `${result.filePath}.html`

  try {
    const embedded = await embedLocalImages(
      request.html,
      request.documentDir ?? dirname(targetPath)
    )
    await writeFileAtomic(targetPath, new TextEncoder().encode(embedded.html))

    if (embedded.missing.length > 0) {
      notify(
        'warning',
        `HTML exporté, mais ${embedded.missing.length} image(s) introuvable(s) : ` +
          `${embedded.missing.join(', ')}. Elles sont remplacées par un texte de remplacement.`
      )
    } else {
      notify('success', `Export HTML enregistré : ${basename(targetPath)}.`)
    }

    return {
      canceled: false,
      path: targetPath,
      missingImages: embedded.missing.length > 0 ? embedded.missing : undefined
    }
  } catch (error) {
    notify(
      'error',
      `Impossible d’exporter le HTML : ${error instanceof Error ? error.message : String(error)}`
    )
    return { canceled: true }
  }
}

async function exportPdf(request: ExportPdfRequest): Promise<ExportPdfResult> {
  if (!mainWindow) return { canceled: true }

  const baseName =
    request.fileName.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '').trim() || 'document'
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter en PDF',
    defaultPath: `${baseName}.pdf`,
    filters: [{ name: 'Document PDF', extensions: ['pdf'] }]
  })

  if (result.canceled || !result.filePath) return { canceled: true }

  const targetPath = /\.pdf$/i.test(result.filePath)
    ? result.filePath
    : `${result.filePath}.pdf`

  try {
    const missing = await renderPdf({
      html: request.html,
      documentDir: request.documentDir,
      options: request.options,
      title: request.title,
      targetPath
    })

    if (missing.length > 0) {
      notify(
        'warning',
        `PDF exporté, mais ${missing.length} image(s) introuvable(s) : ${missing.join(', ')}. ` +
          'Elles sont remplacées par un texte de remplacement.'
      )
    } else {
      notify('success', `Export PDF enregistré : ${basename(targetPath)}.`)
    }

    return {
      canceled: false,
      path: targetPath,
      missingImages: missing.length > 0 ? missing : undefined
    }
  } catch (error) {
    notify(
      'error',
      `Impossible d’exporter le PDF : ${error instanceof Error ? error.message : String(error)}`
    )
    return { canceled: true }
  }
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: 'about', label: `À propos de ${APP_NAME}` },
              { type: 'separator' },
              { role: 'hide', label: 'Masquer' },
              { role: 'hideOthers', label: 'Masquer les autres' },
              { role: 'unhide', label: 'Tout afficher' },
              { type: 'separator' },
              { role: 'quit', label: 'Quitter' }
            ]
          } as MenuItemConstructorOptions
        ]
      : []),
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Nouveau document',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendMenuAction('new')
        },
        {
          label: 'Ouvrir…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendMenuAction('open')
        },
        {
          label: 'Ouvrir un dossier…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendMenuAction('open-folder')
        },
        {
          label: 'Ouvrir récent',
          submenu: buildRecentMenu()
        },
        {
          label: 'Importer un document Word (.docx)…',
          click: () => sendMenuAction('import')
        },
        { type: 'separator' },
        {
          label: 'Enregistrer',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendMenuAction('save')
        },
        {
          label: 'Enregistrer sous…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendMenuAction('save-as')
        },
        { type: 'separator' },
        {
          label: 'Fermer l’onglet',
          accelerator: 'CmdOrCtrl+W',
          click: () => sendMenuAction('close-tab')
        },
        {
          label: 'Onglet suivant',
          accelerator: 'Ctrl+Tab',
          click: () => sendMenuAction('next-tab')
        },
        {
          label: 'Onglet précédent',
          accelerator: 'Ctrl+Shift+Tab',
          click: () => sendMenuAction('prev-tab')
        },
        { type: 'separator' },
        {
          label: 'Métadonnées du document…',
          click: () => sendMenuAction('frontmatter')
        },
        {
          label: 'Historique des versions…',
          click: () => sendMenuAction('history')
        },
        {
          label: 'Préférences…',
          click: () => sendMenuAction('preferences')
        },
        { type: 'separator' },
        {
          label: 'Exporter en HTML…',
          click: () => sendMenuAction('export-html')
        },
        {
          label: 'Exporter en PDF…',
          click: () => sendMenuAction('export-pdf')
        },
        {
          label: 'Imprimer…',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow?.webContents.print({ printBackground: true })
        },
        { type: 'separator' },
        {
          label: 'Rouvrir le dernier document au lancement',
          type: 'checkbox',
          checked: settings.reopenLastDocument,
          click: (item) => {
            settings = { ...settings, reopenLastDocument: item.checked }
            saveSettings(app.getPath('userData'), settings)
          }
        },
        isMac ? { role: 'close', label: 'Fermer la fenêtre' } : { role: 'quit', label: 'Quitter' }
      ]
    },
    {
      label: 'Édition',
      submenu: [
        {
          label: 'Annuler',
          accelerator: 'CmdOrCtrl+Z',
          click: () => sendMenuAction('undo')
        },
        {
          label: 'Rétablir',
          accelerator: isMac ? 'CmdOrCtrl+Shift+Z' : 'CmdOrCtrl+Y',
          click: () => sendMenuAction('redo')
        },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
        { type: 'separator' },
        {
          label: 'Rechercher…',
          accelerator: 'CmdOrCtrl+F',
          click: () => sendMenuAction('find')
        },
        { type: 'separator' },
        {
          label: 'Orthographe',
          submenu: [
            {
              label: 'Correction orthographique',
              type: 'checkbox',
              checked: settings.spellCheck,
              click: (item) => setSpellSettings({ spellCheck: item.checked })
            },
            { type: 'separator' },
            ...SPELL_LANGUAGE_OPTIONS.map((option) => ({
              label: option.label,
              type: 'radio' as const,
              checked: settings.spellLanguage === option.code,
              enabled: settings.spellCheck,
              click: () => setSpellSettings({ spellLanguage: option.code })
            }))
          ]
        }
      ]
    },
    {
      label: 'Format',
      submenu: [
        {
          label: 'Gras',
          accelerator: 'CmdOrCtrl+B',
          click: () => sendMenuAction('bold')
        },
        {
          label: 'Italique',
          accelerator: 'CmdOrCtrl+I',
          click: () => sendMenuAction('italic')
        },
        {
          label: 'Souligné',
          accelerator: 'CmdOrCtrl+U',
          click: () => sendMenuAction('underline')
        },
        {
          label: 'Barré',
          accelerator: 'CmdOrCtrl+Shift+X',
          click: () => sendMenuAction('strike')
        },
        {
          label: 'Code en ligne',
          accelerator: 'CmdOrCtrl+E',
          click: () => sendMenuAction('code')
        },
        { type: 'separator' },
        {
          label: 'Lien…',
          accelerator: 'CmdOrCtrl+K',
          click: () => sendMenuAction('link')
        }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        {
          label: 'Thème',
          submenu: [
            {
              label: 'Automatique (système)',
              type: 'radio',
              checked: settings.theme === 'system',
              click: () => {
                applyTheme('system')
                buildMenu()
              }
            },
            {
              label: 'Clair',
              type: 'radio',
              checked: settings.theme === 'light',
              click: () => {
                applyTheme('light')
                buildMenu()
              }
            },
            {
              label: 'Sombre',
              type: 'radio',
              checked: settings.theme === 'dark',
              click: () => {
                applyTheme('dark')
                buildMenu()
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Mode concentration',
          type: 'checkbox',
          checked: settings.focusMode,
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => {
            applyViewSettings({ focusMode: !settings.focusMode })
            buildMenu()
          }
        },
        {
          label: 'Machine à écrire',
          type: 'checkbox',
          checked: settings.typewriterMode,
          click: () => {
            applyViewSettings({ typewriterMode: !settings.typewriterMode })
            buildMenu()
          }
        },
        {
          label: 'Largeur de page',
          submenu: PAGE_WIDTH_OPTIONS.map((option) => ({
            label: option.label,
            type: 'radio' as const,
            checked: settings.pageWidth === option.value,
            click: () => {
              applyViewSettings({ pageWidth: option.value })
              buildMenu()
            }
          }))
        },
        {
          label: 'Typographie',
          submenu: [
            {
              label: 'Police',
              submenu: DOCUMENT_FONT_OPTIONS.map((option) => ({
                label: option.label,
                type: 'radio' as const,
                checked: settings.fontFamily === option.value,
                click: () => {
                  applyViewSettings({ fontFamily: option.value })
                  buildMenu()
                }
              }))
            },
            {
              label: 'Taille du texte',
              submenu: FONT_SIZE_OPTIONS.map((size) => ({
                label: `${size} px`,
                type: 'radio' as const,
                checked: settings.fontSize === size,
                click: () => {
                  applyViewSettings({ fontSize: size })
                  buildMenu()
                }
              }))
            },
            {
              label: 'Interligne',
              submenu: LINE_HEIGHT_OPTIONS.map((option) => ({
                label: option.label,
                type: 'radio' as const,
                checked: Math.abs(settings.lineHeight - option.value) < 0.001,
                click: () => {
                  applyViewSettings({ lineHeight: option.value })
                  buildMenu()
                }
              }))
            },
            {
              label: 'Espacement des paragraphes',
              submenu: PARAGRAPH_SPACING_OPTIONS.map((option) => ({
                label: option.label,
                type: 'radio' as const,
                checked: Math.abs(settings.paragraphSpacing - option.value) < 0.001,
                click: () => {
                  applyViewSettings({ paragraphSpacing: option.value })
                  buildMenu()
                }
              }))
            }
          ]
        },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Taille réelle' },
        { role: 'zoomIn', label: 'Agrandir' },
        { role: 'zoomOut', label: 'Réduire' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
        ...(app.isPackaged
          ? []
          : ([
              { type: 'separator' },
              { role: 'reload', label: 'Recharger' },
              { role: 'toggleDevTools', label: 'Outils de développement' }
            ] as MenuItemConstructorOptions[]))
      ]
    },
    {
      label: 'Aide',
      submenu: [
        {
          label: 'Raccourcis et syntaxe…',
          accelerator: 'CmdOrCtrl+/',
          click: () => sendMenuAction('shortcuts')
        },
        { type: 'separator' },
        {
          label: 'Ouvrir le journal…',
          click: () => {
            const file = getLogFilePath()
            if (file) void shell.openPath(file)
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 880,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: WINDOW_BACKGROUND[resolvedTheme()],
    title: `${APP_NAME}`,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    updateWindowTitle()

    if (pendingEncodingWarning) {
      const fileName = pendingEncodingWarning
      pendingEncodingWarning = null
      showEncodingWarning(fileName)
    }
  })

  if (!app.isPackaged) {
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
    })
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('context-menu', (_event, params) => {
    const contents = mainWindow?.webContents
    if (!contents) return
    const template = buildContextMenu(params, {
      replaceWord: (word) => contents.replaceMisspelling(word),
      addWord: (word) => {
        const added = contents.session.addWordToSpellCheckerDictionary(word)
        notify(added ? 'success' : 'error', added ? `« ${word} » ajouté au dictionnaire` : `Impossible d’ajouter « ${word} »`)
      }
    })
    if (template.length > 0) Menu.buildFromTemplate(template).popup({ window: mainWindow ?? undefined })
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) {
      event.preventDefault()
      if (/^https?:/i.test(url)) void shell.openExternal(url)
    }
  })

  mainWindow.on('close', (event) => {
    if (allowClose || !isDirty) return
    event.preventDefault()

    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: 'warning',
      buttons: ['Enregistrer', 'Ne pas enregistrer', 'Annuler'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      message: 'Enregistrer les modifications ?',
      detail: closeDetail()
    })

    if (choice === 2) return
    if (choice === 1) {
      clearAutosaveSync(app.getPath('userData'))
      allowClose = true
      mainWindow?.close()
      return
    }
    mainWindow?.webContents.send('app:save-and-close')
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('doc:get-initial', (): InitialDocument => {
  return (
    initialDocument ?? {
      path: null,
      name: 'Sans titre',
      content: '',
      format: defaultFileFormat(),
      defaultFormat: defaultFileFormat()
    }
  )
})

async function openFilePath(filePath: string): Promise<OpenFileResult> {
  const document = await readDocument(filePath)
  if (document.fallback) showEncodingWarning(basename(filePath))
  currentDocumentPath = filePath
  knownStamps.set(filePath, await readStamp(filePath))
  rememberFile(filePath)
  return {
    canceled: false,
    path: filePath,
    name: basename(filePath),
    content: document.content,
    format: document.format
  }
}

async function showPandocRequired(): Promise<void> {
  if (!mainWindow) return

  const choice = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Pandoc introuvable',
    message: 'Importer un document Word nécessite Pandoc',
    detail:
      'Pandoc n’a pas été trouvé sur cet ordinateur. Installez-le, puis relancez l’application. ' +
      'Exemples : « sudo apt install pandoc » sous Linux, « brew install pandoc » sous macOS, ' +
      '« winget install pandoc » sous Windows.',
    buttons: ['Ouvrir la page de Pandoc', 'Annuler'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  })
  if (choice.response === 0) void shell.openExternal('https://pandoc.org/installing.html')
}

async function importDocxAt(docxPath: string, targetPath: string): Promise<OpenFileResult> {
  const pandoc = await findPandoc()
  if (!pandoc) throw new Error('Pandoc introuvable')

  const conversion = await importDocxFile({
    pandocPath: pandoc.path,
    docxPath,
    targetPath
  })

  if (!conversion.markdown.trim()) {
    notify(
      'warning',
      'Le document importé ne contient aucun texte exploitable (document scanné ou vide).'
    )
  }
  if (conversion.unsupportedImages.length > 0) {
    notify(
      'warning',
      `Images non affichables par l’éditeur : ${conversion.unsupportedImages.join(', ')}. ` +
        'Elles restent présentes dans le dossier d’images extrait.'
    )
  }
  if (conversion.mediaFolder) {
    notify('info', `Images extraites dans « ${conversion.mediaFolder} ».`)
  }

  return openFilePath(targetPath)
}

ipcMain.handle('dialog:import-docx', async (): Promise<OpenFileResult> => {
  if (!mainWindow) return { canceled: true }

  const pandoc = await findPandoc()
  if (!pandoc) {
    await showPandocRequired()
    return { canceled: true }
  }

  const picked = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer un document Word',
    properties: ['openFile'],
    filters: [{ name: 'Documents Word', extensions: ['docx'] }]
  })
  if (picked.canceled || picked.filePaths.length === 0) return { canceled: true }

  const docxPath = picked.filePaths[0]
  const suggestedPath = join(dirname(docxPath), `${basename(docxPath, extname(docxPath))}.md`)
  const target = await dialog.showSaveDialog(mainWindow, {
    title: 'Enregistrer le document importé',
    defaultPath: suggestedPath,
    filters: MARKDOWN_FILTERS
  })
  if (target.canceled || !target.filePath) return { canceled: true }

  // Some save dialogs do not append the filter's extension.
  const targetPath = extname(target.filePath) ? target.filePath : `${target.filePath}.md`

  if (resolve(targetPath) === resolve(docxPath)) {
    notify('error', 'Le document importé ne peut pas remplacer le fichier Word d’origine.')
    return { canceled: true }
  }
  if (extname(targetPath).toLowerCase() === '.docx') {
    notify('error', 'Choisissez une extension Markdown (.md) pour le document importé.')
    return { canceled: true }
  }

  try {
    return await importDocxAt(docxPath, targetPath)
  } catch (error) {
    notify(
      'error',
      `Import impossible : ${error instanceof Error ? error.message : String(error)}`
    )
    return { canceled: true }
  }
})

ipcMain.handle('dialog:open', async (): Promise<OpenFileResult> => {
  if (!mainWindow) return { canceled: true }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Ouvrir un document Markdown',
    properties: ['openFile'],
    filters: MARKDOWN_FILTERS
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }

  try {
    return await openFilePath(result.filePaths[0])
  } catch (error) {
    notify('error', `Impossible d’ouvrir le fichier : ${error instanceof Error ? error.message : String(error)}`)
    return { canceled: true }
  }
})

ipcMain.handle('open:path', async (_event, filePath: string): Promise<OpenFileResult> => {
  if (!mainWindow || !filePath) return { canceled: true }

  try {
    return await openFilePath(filePath)
  } catch (error) {
    notify('error', `Impossible d’ouvrir le fichier : ${error instanceof Error ? error.message : String(error)}`)
    return { canceled: true }
  }
})

async function isExistingFile(filePath: string): Promise<boolean> {
  return stat(filePath).then(
    (info) => info.isFile(),
    () => false
  )
}

async function keepPreviousVersion(filePath: string): Promise<void> {
  try {
    const previous = await readDocument(filePath)
    await recordVersion(app.getPath('userData'), filePath, previous.content)
  } catch (error) {
    log('warn', 'Version précédente non conservée', {
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

ipcMain.handle('history:list', (_event, path: string): Promise<HistoryVersion[]> =>
  listVersions(app.getPath('userData'), path)
)

ipcMain.handle('history:read', (_event, path: string, id: string): Promise<string | null> =>
  readVersion(app.getPath('userData'), path, id)
)

ipcMain.handle('dialog:save', async (_event, request: SaveFileRequest): Promise<SaveFileResult> => {
  if (!mainWindow) return { canceled: true }

  let targetPath = request.saveAs ? null : request.path

  // Detect changes made outside the editor before overwriting in place.
  const knownStamp = targetPath && !request.saveAs ? knownStamps.get(targetPath) : undefined
  if (targetPath && knownStamp) {
    const onDisk = await readStamp(targetPath)
    if (stampChanged(knownStamp, onDisk)) {
      const resolution = askConflictResolution(basename(targetPath))
      if (resolution === 'cancel') return { canceled: true }
      if (resolution === 'reload') {
        await reloadDocumentFromDisk(targetPath)
        return { canceled: true }
      }
      if (resolution === 'save-as') targetPath = null
      // 'overwrite' keeps the original target and falls through.
    }
  }

  if (!targetPath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Enregistrer le document',
      defaultPath: request.path ?? `${currentDocumentName}.md`,
      filters: MARKDOWN_FILTERS
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    targetPath = result.filePath
  }

  if (!extname(targetPath)) targetPath = `${targetPath}.md`

  try {
    // The version being replaced is kept first, so an overwrite is never final.
    if (await isExistingFile(targetPath)) await keepPreviousVersion(targetPath)
    await writeFileAtomic(targetPath, encodeDocument(request.content, request.format))
    currentDocumentPath = targetPath
    knownStamps.set(targetPath, await readStamp(targetPath))
    rememberFile(targetPath)
    return { canceled: false, path: targetPath, name: basename(targetPath) }
  } catch (error) {
    notify('error', `Impossible d’enregistrer le fichier : ${error instanceof Error ? error.message : String(error)}`)
    return { canceled: true }
  }
})

ipcMain.handle(
  'dialog:export-html',
  (_event, request: ExportHtmlRequest): Promise<ExportHtmlResult> => exportHtml(request)
)

ipcMain.handle(
  'dialog:export-pdf',
  (_event, request: ExportPdfRequest): Promise<ExportPdfResult> => exportPdf(request)
)

ipcMain.handle('workspace:open', async (): Promise<WorkspaceState | null> => {
  if (!mainWindow) return null
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: 'Ouvrir un dossier',
    properties: ['openDirectory']
  })
  if (picked.canceled || picked.filePaths.length === 0) return null

  workspaceRoot = picked.filePaths[0]
  log('info', 'Dossier ouvert', { folder: basename(workspaceRoot) })
  return scanWorkspace(workspaceRoot)
})

ipcMain.handle('workspace:get', async (): Promise<WorkspaceState | null> => {
  return workspaceRoot ? scanWorkspace(workspaceRoot) : null
})

ipcMain.handle('prefs:get', (): PreferencesView => pickPreferences(settings))

ipcMain.handle('prefs:set', (_event, patch: unknown): PreferencesView => {
  const changes = sanitizePreferencesPatch(patch)
  settings = normalizeSettings({ ...settings, ...changes })
  saveSettings(app.getPath('userData'), settings)
  if ('spellCheck' in changes || 'spellLanguage' in changes) applySpellSettings()
  if ('spellCheck' in changes || 'spellLanguage' in changes || 'reopenLastDocument' in changes) {
    buildMenu()
  }
  const view = pickPreferences(settings)
  mainWindow?.webContents.send('prefs:changed', view)
  return view
})

ipcMain.handle('workspace:close', (): void => {
  workspaceRoot = null
})

ipcMain.handle('dialog:confirm-discard', (): DiscardChoice => {
  if (!mainWindow) return 'discard'
  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: 'warning',
    buttons: ['Enregistrer', 'Ne pas enregistrer', 'Annuler'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    message: 'Enregistrer les modifications ?',
    detail: `« ${currentDocumentName} » contient des modifications non enregistrées.`
  })
  if (choice === 0) return 'save'
  if (choice === 1) return 'discard'
  return 'cancel'
})

ipcMain.handle('shell:open-external', async (_event, url: string): Promise<void> => {
  if (/^https?:/i.test(url)) await shell.openExternal(url)
})

ipcMain.handle('clipboard:write-text', (_event, text: string): void => {
  clipboard.writeText(text)
})

ipcMain.handle('clipboard:read-text', (): string => clipboard.readText())

ipcMain.handle('theme:get', (): ThemeState => themeState())

ipcMain.handle('theme:set', (_event, preference: ThemePreference): ThemeState => {
  if (!isThemePreference(preference)) return themeState()
  const state = applyTheme(preference)
  buildMenu()
  return state
})

ipcMain.handle('view:get', (): ViewSettings => viewSettings())

ipcMain.handle('library:get', (): LibraryState => loadLibrary(app.getPath('userData')))

ipcMain.handle('library:open-folder', async (): Promise<void> => {
  const userData = app.getPath('userData')
  loadLibrary(userData)
  const error = await shell.openPath(libraryRoot(userData))
  if (error) log('warn', "Ouverture du dossier des modèles impossible", { error })
})

ipcMain.handle('view:set', (_event, patch: Partial<ViewSettings>): ViewSettings => {
  const next = applyViewSettings(patch)
  buildMenu()
  return next
})

ipcMain.handle('dialog:pick-image', async (): Promise<string | null> => {
  if (!mainWindow) return null

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Sélectionner une image',
    properties: ['openFile'],
    filters: IMAGE_FILTERS
  })

  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('image:import', async (_event, sourcePath: string): Promise<string | null> => {
  if (!currentDocumentPath) return null
  return importImageFile(dirname(currentDocumentPath), sourcePath)
})

ipcMain.handle('image:import-buffer', async (_event, bytes: Uint8Array, mimeType: string): Promise<string | null> => {
  if (!currentDocumentPath) return null
  return importImageBuffer(dirname(currentDocumentPath), bytes, mimeType)
})

ipcMain.handle('autosave:write', async (_event, entries: AutosaveEntry[]): Promise<void> => {
  await writeAutosave(app.getPath('userData'), entries)
})

ipcMain.handle('autosave:clear', async (): Promise<void> => {
  await clearAutosave(app.getPath('userData'))
})

ipcMain.on('log:write', (_event, level: LogLevel, message: string, meta?: unknown): void => {
  log(level, message, meta)
})

ipcMain.on('doc:set-meta', (_event, meta: DocumentMeta) => {
  currentDocumentName = meta.name || 'Sans titre'
  currentDocumentPath = meta.path
  isDirty = meta.dirty || meta.dirtyNames.length > 0
  dirtyTabNames = meta.dirtyNames
  updateWindowTitle()
})

ipcMain.on('app:close-now', () => {
  allowClose = true
  mainWindow?.close()
})

async function openInitialFile(filePath: string): Promise<void> {
  try {
    const document = await readDocument(filePath)
    initialDocument = {
      path: filePath,
      name: basename(filePath),
      content: document.content,
      format: document.format,
      defaultFormat: defaultFileFormat()
    }
    currentDocumentName = initialDocument.name
    currentDocumentPath = filePath
    knownStamps.set(filePath, await readStamp(filePath))
    rememberFile(filePath)
    if (document.fallback) pendingEncodingWarning = initialDocument.name
  } catch {
    initialDocument = null
  }
}

if (gotSingleInstanceLock) {
  app.whenReady().then(async () => {
    initLogger(app.getPath('userData'))
    log('info', 'Application démarrée', {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      platform: process.platform
    })

    // Handle local-file:///path requests — serve image files from disk while
    // blocking access to anything outside of known image extensions.
    protocol.handle('local-file', async (request) => {
      const url = new URL(request.url)
      // Reconstruct the absolute path from the URL (host is empty, pathname is
      // the encoded absolute path, e.g. local-file:///home/user/img.png).
      const filePath = decodeURIComponent(url.pathname)
      const ext = extname(filePath).slice(1).toLowerCase()
      if (!IMAGE_EXTENSIONS.includes(ext)) {
        return new Response('Forbidden', { status: 403 })
      }
      try {
        const data = await readFile(filePath)
        return new Response(new Uint8Array(data), {
          headers: { 'Content-Type': IMAGE_MIME[ext] ?? 'application/octet-stream' }
        })
      } catch (error) {
        log('error', 'Échec de lecture d’image', { filePath, message: String(error) })
        return new Response('Not found', { status: 404 })
      }
    })

    settings = loadSettings(app.getPath('userData'))
    applySpellSettings()
    nativeTheme.themeSource = settings.theme
    nativeTheme.on('updated', () => {
      mainWindow?.setBackgroundColor(WINDOW_BACKGROUND[resolvedTheme()])
      mainWindow?.webContents.send('theme:changed', themeState())
      if (mainWindow) buildMenu()
    })
    recentFiles = filterExistingFiles(loadRecentFiles(app.getPath('userData')))

    // Offer to recover an unsaved draft left behind by a previous crash.
    let restored: AutosaveRecord | null = null
    const draft = readAutosaveSync(app.getPath('userData'))
    const recoverable = draft?.documents.filter((document) => document.content.length > 0) ?? []
    if (draft && recoverable.length > 0) {
      const choice = chooseAutosaveResolution(draft)
      if (choice === 'restore') restored = { ...draft, documents: recoverable }
      else clearAutosaveSync(app.getPath('userData'))
    } else if (draft) {
      // Empty or invalid draft: nothing worth recovering.
      clearAutosaveSync(app.getPath('userData'))
    }

    const filePath = findFileArgument()
    if (filePath) {
      await openInitialFile(filePath)
    }

    if (restored) {
      const [first, ...rest] = restored.documents
      const toInitial = (document: AutosaveEntry): InitialDocument => ({
        path: document.path,
        name: document.name || 'Sans titre',
        content: document.content,
        format: document.format,
        defaultFormat: defaultFileFormat(),
        unsaved: true
      })
      initialDocument = { ...toInitial(first), extra: rest.map(toInitial) }
      currentDocumentPath = first.path
      currentDocumentName = first.name || 'Sans titre'
      for (const document of restored.documents) {
        if (document.path) knownStamps.set(document.path, await readStamp(document.path))
      }
      isDirty = true
      log('info', 'Brouillons restaurés', { count: restored.documents.length })
    } else if (!filePath && settings.reopenLastDocument && recentFiles.length > 0) {
      // Reopen the most recent document when the app starts on its own.
      await openInitialFile(recentFiles[0])
      if (initialDocument) log('info', 'Dernier document rouvert', { path: recentFiles[0] })
    }

    buildMenu()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    log('info', 'Application fermée')
    if (process.platform !== 'darwin') app.quit()
  })
}
