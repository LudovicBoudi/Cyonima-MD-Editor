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
import type { MenuItemConstructorOptions, MessageBoxSyncOptions, OpenDialogOptions } from 'electron'
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
import { clearAutosaveSync, readAutosaveSync, writeAutosave } from './autosave'
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
  for (const ws of windowStates.values()) {
    ws.win.webContents.send('view:changed', next)
  }
  return next
}

function applyTheme(preference: ThemePreference): ThemeState {
  settings = { ...settings, theme: preference }
  saveSettings(app.getPath('userData'), settings)
  nativeTheme.themeSource = preference
  const state = themeState()
  // Notify explicitly: changing themeSource does not always emit `updated`
  // (for example system → light while the OS is already light).
  for (const ws of windowStates.values()) {
    ws.win.setBackgroundColor(WINDOW_BACKGROUND[resolvedTheme()])
    ws.win.webContents.send('theme:changed', state)
  }
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

// ---------------------------------------------------------------------------
// Per-window state
// ---------------------------------------------------------------------------

/** State scoped to one BrowserWindow, keyed by webContents id. */
interface WindowState {
  win: BrowserWindow
  currentDocumentName: string
  currentDocumentPath: string | null
  isDirty: boolean
  dirtyTabNames: string[]
  allowClose: boolean
  workspaceRoot: string | null
  /** Every file open in this window, active tab included. */
  openPaths: Set<string>
}

const windowStates = new Map<number, WindowState>()

function windowStateFrom(webContentsId: number): WindowState | undefined {
  return windowStates.get(webContentsId)
}

/** Stable comparison key for a file path. */
function pathKey(filePath: string): string {
  const resolved = resolve(filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/** Another window holding `filePath` open, if any. */
function otherWindowWithPath(filePath: string, exceptWebContentsId: number): WindowState | undefined {
  const key = pathKey(filePath)
  for (const [id, ws] of windowStates) {
    if (id !== exceptWebContentsId && ws.openPaths.has(key)) return ws
  }
  return undefined
}

/** Last window that had focus, used when a native dialog is in front. */
let lastActiveWindowId: number | null = null

/**
 * Returns the focused window's state, falling back to the last focused window
 * and finally to the most recently opened one.
 */
function focusedWindowState(): WindowState | undefined {
  const focused = BrowserWindow.getFocusedWindow()
  const focusedState = focused ? windowStates.get(focused.webContents.id) : undefined
  if (focusedState) return focusedState
  if (lastActiveWindowId !== null) {
    const last = windowStates.get(lastActiveWindowId)
    if (last) return last
  }
  return [...windowStates.values()].at(-1)
}

/** Map of initial documents waiting to be consumed by their renderer on startup. */
const pendingInitialDocuments = new Map<number, InitialDocument>()

/** Autosave drafts per window, merged before writing so no window erases another. */
const autosaveByWindow = new Map<number, AutosaveEntry[]>()

// Writing is serialised: two windows saving at once must not interleave, and
// the last write must reflect the latest union of drafts.
let autosaveFlush: Promise<void> = Promise.resolve()

function flushAutosave(): Promise<void> {
  autosaveFlush = autosaveFlush.then(async () => {
    await writeAutosave(app.getPath('userData'), [...autosaveByWindow.values()].flat())
  })
  autosaveFlush = autosaveFlush.catch((error: unknown) => {
    log('error', 'Échec de la copie de secours', {
      error: error instanceof Error ? error.message : String(error)
    })
  })
  return autosaveFlush
}

// ---------------------------------------------------------------------------
// App-level globals (shared across all windows)
// ---------------------------------------------------------------------------

/** File requested by macOS before the app is ready (`open-file`). */
let pendingOpenFile: string | null = null
/** Encoding warning waiting for the first window's content to be ready. */
let pendingEncodingWarning: string | null = null
/** Encoding warnings attached to a specific window, by `webContents.id`. */
const encodingWarnings = new Map<number, string>()
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
    const filePath = extractFileArgument(commandLine.slice(process.defaultApp ? 2 : 1), workingDirectory)
    if (!app.isReady()) {
      // Still starting: the file will be used by the first window.
      if (filePath) pendingOpenFile = filePath
      return
    }
    const ws = focusedWindowState()

    if (!ws) {
      // No window left (macOS keeps the app alive): create one.
      if (filePath) void createWindowForFile(filePath)
      else createWindow()
      return
    }

    if (ws.win.isMinimized()) ws.win.restore()
    ws.win.focus()
    // Open the requested file as a new tab in the window brought to front.
    if (filePath) ws.win.webContents.send('app:open-file', filePath)
  })

  // macOS delivers documents opened from Finder or another app here. This can
  // happen before `whenReady`, so the path is kept until the first window exists.
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    if (!app.isReady()) {
      pendingOpenFile = filePath
      return
    }

    const ws = focusedWindowState()
    if (!ws) {
      void createWindowForFile(filePath)
      return
    }
    if (ws.win.isMinimized()) ws.win.restore()
    ws.win.focus()
    ws.win.webContents.send('app:open-file', filePath)
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

function showEncodingWarning(fileName: string, win?: BrowserWindow): void {
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

  const target = win ?? focusedWindowState()?.win ?? null
  if (target) dialog.showMessageBoxSync(target, options)
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

async function reloadDocumentFromDisk(filePath: string, ws: WindowState): Promise<void> {
  const document = await readDocument(filePath)
  ws.currentDocumentPath = filePath
  ws.currentDocumentName = basename(filePath)
  knownStamps.set(filePath, await readStamp(filePath))

  const payload: ReloadDocumentPayload = {
    path: filePath,
    name: basename(filePath),
    content: document.content,
    format: document.format
  }
  ws.win.webContents.send('doc:reload', payload)

  if (document.fallback) showEncodingWarning(basename(filePath), ws.win)
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

function askConflictResolution(
  fileName: string,
  win?: BrowserWindow,
  otherWindowTitle?: string
): ConflictResolution {
  // Test-only seam: allows deterministic E2E verification of each branch.
  const forced = process.env['CYONIMA_CONFLICT_CHOICE']
  if (forced === 'overwrite' || forced === 'reload' || forced === 'save-as' || forced === 'cancel') {
    return forced
  }

  const options: MessageBoxSyncOptions = otherWindowTitle
    ? {
        type: 'warning',
        buttons: ['Recharger', 'Écraser', 'Enregistrer sous', 'Annuler'],
        defaultId: 3,
        cancelId: 3,
        noLink: true,
        message: 'Le fichier est aussi ouvert dans une autre fenêtre',
        detail:
          `« ${fileName} » est aussi ouvert dans une autre fenêtre (« ${otherWindowTitle} »). ` +
          'Enregistrer ici écraserait ce que cette fenêtre a pu enregistrer. ' +
          '« Recharger » relit la version du disque dans cette fenêtre.'
      }
    : {
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

  const target = win ?? focusedWindowState()?.win ?? null
  const choice = target
    ? dialog.showMessageBoxSync(target, options)
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
function closeDetail(ws: WindowState): string {
  const names = ws.dirtyTabNames.length > 0 ? ws.dirtyTabNames : [ws.currentDocumentName]
  if (names.length === 1) return `« ${names[0]} » contient des modifications non enregistrées.`
  return `${names.length} documents contiennent des modifications non enregistrées : ${names.map((name) => `« ${name} »`).join(', ')}.`
}

function updateWindowTitle(ws: WindowState): void {
  const marker = ws.isDirty ? '• ' : ''
  ws.win.setTitle(`${marker}${ws.currentDocumentName} — ${APP_NAME}`)
}

/**
 * Sends a menu action to the focused window. If no window has focus (e.g. a
 * native dialog is in front), falls back to the last focused window.
 */
function sendMenuAction(action: MenuAction): void {
  focusedWindowState()?.win.webContents.send('menu:action', action)
}

const NOTIFY_TO_LOG: Record<NotifyLevel, LogLevel> = {
  info: 'info',
  success: 'info',
  warning: 'warn',
  error: 'error'
}

function notifyWindow(
  win: BrowserWindow | null | undefined,
  level: NotifyLevel,
  message: string
): void {
  if (!win || win.isDestroyed()) {
    notify(level, message)
    return
  }
  log(NOTIFY_TO_LOG[level], message)
  win.webContents.send('app:notify', { level, message, at: Date.now() })
}

function notify(level: NotifyLevel, message: string): void {
  // Send to the focused window; if none is focused send to all open windows.
  const focused = focusedWindowState()
  if (focused) {
    notifyWindow(focused.win, level, message)
    return
  }
  log(NOTIFY_TO_LOG[level], message)
  const payload = { level, message, at: Date.now() }
  for (const ws of windowStates.values()) {
    if (!ws.win.isDestroyed()) ws.win.webContents.send('app:notify', payload)
  }
}

function rememberFile(filePath: string): void {
  recentFiles = addRecentFile(recentFiles, filePath)
  saveRecentFiles(app.getPath('userData'), recentFiles)
  buildMenu()
}

function openRecentFile(filePath: string): void {
  // Send to the focused window; if none is focused, open in a new window.
  const focused = focusedWindowState()
  if (focused) {
    focused.win.webContents.send('app:open-file', filePath)
  } else {
    void createWindowForFile(filePath)
  }
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

async function exportHtml(request: ExportHtmlRequest, win?: BrowserWindow): Promise<ExportHtmlResult> {
  const target = win ?? focusedWindowState()?.win
  if (!target) return { canceled: true }

  const baseName =
    request.fileName.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '').trim() || 'document'
  const result = await dialog.showSaveDialog(target, {
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
      notifyWindow(
        target,
        'warning',
        `HTML exporté, mais ${embedded.missing.length} image(s) introuvable(s) : ` +
          `${embedded.missing.join(', ')}. Elles sont remplacées par un texte de remplacement.`
      )
    } else {
      notifyWindow(target, 'success', `Export HTML enregistré : ${basename(targetPath)}.`)
    }

    return {
      canceled: false,
      path: targetPath,
      missingImages: embedded.missing.length > 0 ? embedded.missing : undefined
    }
  } catch (error) {
    notifyWindow(
      target,
      'error',
      `Impossible d’exporter le HTML : ${error instanceof Error ? error.message : String(error)}`
    )
    return { canceled: true }
  }
}

async function exportPdf(request: ExportPdfRequest, win?: BrowserWindow): Promise<ExportPdfResult> {
  const target = win ?? focusedWindowState()?.win
  if (!target) return { canceled: true }

  const baseName =
    request.fileName.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '').trim() || 'document'
  const result = await dialog.showSaveDialog(target, {
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
          label: 'Nouvelle fenêtre',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => sendMenuAction('new-window')
        },
        {
          label: 'Ouvrir dans une nouvelle fenêtre…',
          click: () => void openFileInNewWindow()
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
          click: () => focusedWindowState()?.win.webContents.print({ printBackground: true })
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

function createWindow(initial?: InitialDocument | null): BrowserWindow {
  const win = new BrowserWindow({
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

  // Per-window state; isDirty is set after restoration below if needed.
  const ws: WindowState = {
    win,
    currentDocumentName: 'Sans titre',
    currentDocumentPath: null,
    isDirty: false,
    dirtyTabNames: [],
    allowClose: false,
    workspaceRoot: null,
    openPaths: new Set()
  }
  const webContentsId = win.webContents.id
  windowStates.set(webContentsId, ws)

  // A startup file warning belongs to the first window created.
  if (pendingEncodingWarning) {
    encodingWarnings.set(webContentsId, pendingEncodingWarning)
    pendingEncodingWarning = null
  }

  // The document must be known before the renderer asks for it, which is why
  // reading happens before this function is called (see createWindowForFile).
  if (initial) {
    pendingInitialDocuments.set(webContentsId, initial)
    ws.currentDocumentName = initial.name
    ws.currentDocumentPath = initial.path
    ws.isDirty = initial.unsaved ?? false
  }

  win.on('focus', () => {
    lastActiveWindowId = webContentsId
  })

  win.on('ready-to-show', () => {
    win.show()
    updateWindowTitle(ws)

    const encodingWarning = encodingWarnings.get(webContentsId)
    if (encodingWarning) {
      encodingWarnings.delete(webContentsId)
      showEncodingWarning(encodingWarning, win)
    }
  })

  if (!app.isPackaged) {
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
    })
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('context-menu', (_event, params) => {
    const contents = win.webContents
    const template = buildContextMenu(params, {
      replaceWord: (word) => contents.replaceMisspelling(word),
      addWord: (word) => {
        const added = contents.session.addWordToSpellCheckerDictionary(word)
        notifyWindow(
          win,
          added ? 'success' : 'error',
          added ? `« ${word} » ajouté au dictionnaire` : `Impossible d’ajouter « ${word} »`
        )
      }
    })
    if (template.length > 0) Menu.buildFromTemplate(template).popup({ window: win })
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault()
      if (/^https?:/i.test(url)) void shell.openExternal(url)
    }
  })

  win.on('close', (event) => {
    if (ws.allowClose || !ws.isDirty) return
    event.preventDefault()

    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Enregistrer', 'Ne pas enregistrer', 'Annuler'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      message: 'Enregistrer les modifications ?',
      detail: closeDetail(ws)
    })

    if (choice === 2) return
    if (choice === 1) {
      ws.allowClose = true
      win.close()
      return
    }
    win.webContents.send('app:save-and-close')
  })

  win.on('closed', () => {
    windowStates.delete(webContentsId)
    pendingInitialDocuments.delete(webContentsId)
    encodingWarnings.delete(webContentsId)
    autosaveByWindow.delete(webContentsId)
    if (windowStates.size > 0) {
      // Other windows still hold drafts: rewrite the union without this one.
      void flushAutosave()
    } else {
      // Last window: drop the recovery file synchronously so nothing stale is
      // offered after a normal quit.
      clearAutosaveSync(app.getPath('userData'))
    }
    if (lastActiveWindowId === webContentsId) lastActiveWindowId = null
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/**
 * Reads a file before creating its window, so the renderer always finds its
 * initial document ready when it asks for it.
 */
async function createWindowForFile(filePath: string): Promise<void> {
  try {
    const document = await readDocument(filePath)
    const win = createWindow({
      path: filePath,
      name: basename(filePath),
      content: document.content,
      format: document.format,
      defaultFormat: defaultFileFormat()
    })
    knownStamps.set(filePath, await readStamp(filePath))
    rememberFile(filePath)
    if (document.fallback) showEncodingWarning(basename(filePath), win)
  } catch (error) {
    notify('error', `Impossible d’ouvrir le fichier : ${error instanceof Error ? error.message : String(error)}`)
    createWindow()
  }
}

/** Fichier → « Ouvrir dans une nouvelle fenêtre… ». */
async function openFileInNewWindow(): Promise<void> {
  const win = focusedWindowState()?.win
  const options: OpenDialogOptions = {
    title: 'Ouvrir dans une nouvelle fenêtre',
    properties: ['openFile'],
    filters: MARKDOWN_FILTERS
  }
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return
  await createWindowForFile(result.filePaths[0])
}

ipcMain.handle('window:new', (): void => {
  createWindow()
})

ipcMain.handle('doc:get-initial', (event): InitialDocument => {
  const pending = pendingInitialDocuments.get(event.sender.id)
  if (pending) {
    pendingInitialDocuments.delete(event.sender.id)
    return pending
  }
  return {
    path: null,
    name: 'Sans titre',
    content: '',
    format: defaultFileFormat(),
    defaultFormat: defaultFileFormat()
  }
})

async function openFilePath(filePath: string, win?: BrowserWindow): Promise<OpenFileResult> {
  const document = await readDocument(filePath)
  if (document.fallback) showEncodingWarning(basename(filePath), win)
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

async function showPandocRequired(win: BrowserWindow): Promise<void> {
  const choice = await dialog.showMessageBox(win, {
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

async function importDocxAt(
  docxPath: string,
  targetPath: string,
  win: BrowserWindow
): Promise<OpenFileResult> {
  const pandoc = await findPandoc()
  if (!pandoc) throw new Error('Pandoc introuvable')

  const conversion = await importDocxFile({
    pandocPath: pandoc.path,
    docxPath,
    targetPath
  })

  if (!conversion.markdown.trim()) {
    notifyWindow(
      win,
      'warning',
      'Le document importé ne contient aucun texte exploitable (document scanné ou vide).'
    )
  }
  if (conversion.unsupportedImages.length > 0) {
    notifyWindow(
      win,
      'warning',
      `Images non affichables par l’éditeur : ${conversion.unsupportedImages.join(', ')}. ` +
        'Elles restent présentes dans le dossier d’images extrait.'
    )
  }
  if (conversion.mediaFolder) {
    notifyWindow(win, 'info', `Images extraites dans « ${conversion.mediaFolder} ».`)
  }

  return openFilePath(targetPath, win)
}

ipcMain.handle('dialog:import-docx', async (event): Promise<OpenFileResult> => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { canceled: true }

  const pandoc = await findPandoc()
  if (!pandoc) {
    await showPandocRequired(win)
    return { canceled: true }
  }

  const picked = await dialog.showOpenDialog(win, {
    title: 'Importer un document Word',
    properties: ['openFile'],
    filters: [{ name: 'Documents Word', extensions: ['docx'] }]
  })
  if (picked.canceled || picked.filePaths.length === 0) return { canceled: true }

  const docxPath = picked.filePaths[0]
  const suggestedPath = join(dirname(docxPath), `${basename(docxPath, extname(docxPath))}.md`)
  const target = await dialog.showSaveDialog(win, {
    title: 'Enregistrer le document importé',
    defaultPath: suggestedPath,
    filters: MARKDOWN_FILTERS
  })
  if (target.canceled || !target.filePath) return { canceled: true }

  // Some save dialogs do not append the filter's extension.
  const targetPath = extname(target.filePath) ? target.filePath : `${target.filePath}.md`

  if (resolve(targetPath) === resolve(docxPath)) {
    notifyWindow(win, 'error', 'Le document importé ne peut pas remplacer le fichier Word d’origine.')
    return { canceled: true }
  }
  if (extname(targetPath).toLowerCase() === '.docx') {
    notifyWindow(win, 'error', 'Choisissez une extension Markdown (.md) pour le document importé.')
    return { canceled: true }
  }

  try {
    return await importDocxAt(docxPath, targetPath, win)
  } catch (error) {
    notifyWindow(
      win,
      'error',
      `Import impossible : ${error instanceof Error ? error.message : String(error)}`
    )
    return { canceled: true }
  }
})

ipcMain.handle('dialog:open', async (event): Promise<OpenFileResult> => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { canceled: true }

  const result = await dialog.showOpenDialog(win, {
    title: 'Ouvrir un document Markdown',
    properties: ['openFile'],
    filters: MARKDOWN_FILTERS
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }

  try {
    return await openFilePath(result.filePaths[0], win)
  } catch (error) {
    notifyWindow(
      win,
      'error',
      `Impossible d’ouvrir le fichier : ${error instanceof Error ? error.message : String(error)}`
    )
    return { canceled: true }
  }
})

ipcMain.handle('open:path', async (event, filePath: string): Promise<OpenFileResult> => {
  if (!filePath) return { canceled: true }
  const win = BrowserWindow.fromWebContents(event.sender)

  try {
    return await openFilePath(filePath, win ?? undefined)
  } catch (error) {
    notifyWindow(
      win,
      'error',
      `Impossible d’ouvrir le fichier : ${error instanceof Error ? error.message : String(error)}`
    )
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

ipcMain.handle('dialog:save', async (event, request: SaveFileRequest): Promise<SaveFileResult> => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { canceled: true }
  const ws = windowStateFrom(event.sender.id)

  let targetPath = request.saveAs ? null : request.path

  // Detect changes made outside the editor before overwriting in place.
  const knownStamp = targetPath && !request.saveAs ? knownStamps.get(targetPath) : undefined
  if (targetPath && knownStamp) {
    const onDisk = await readStamp(targetPath)
    if (stampChanged(knownStamp, onDisk)) {
      const resolution = askConflictResolution(basename(targetPath), win)
      if (resolution === 'cancel') return { canceled: true }
      if (resolution === 'reload') {
        if (ws) await reloadDocumentFromDisk(targetPath, ws)
        return { canceled: true }
      }
      if (resolution === 'save-as') targetPath = null
      // 'overwrite' keeps the original target and falls through.
    }
  }

  // A path can be retargeted when the user chooses "Enregistrer sous" after
  // being warned, so the checks below run again.
  for (;;) {
    if (!targetPath) {
      const result = await dialog.showSaveDialog(win, {
        title: 'Enregistrer le document',
        defaultPath: request.path ?? `${ws?.currentDocumentName ?? 'Sans titre'}.md`,
        filters: MARKDOWN_FILTERS
      })
      if (result.canceled || !result.filePath) return { canceled: true }
      targetPath = result.filePath
    }

    if (!extname(targetPath)) targetPath = `${targetPath}.md`

    // The other window only reports its open files; the disk itself may still
    // hold an older version. Either way, saving here could lose its work.
    const other = otherWindowWithPath(targetPath, event.sender.id)
    if (!other) break

    const resolution = askConflictResolution(
      basename(targetPath),
      win,
      other.win.getTitle()
    )
    if (resolution === 'cancel') return { canceled: true }
    if (resolution === 'reload') {
      if (ws) await reloadDocumentFromDisk(targetPath, ws)
      return { canceled: true }
    }
    if (resolution === 'save-as') {
      targetPath = null
      continue
    }
    break
  }

  try {
    // The version being replaced is kept first, so an overwrite is never final.
    if (await isExistingFile(targetPath)) await keepPreviousVersion(targetPath)
    await writeFileAtomic(targetPath, encodeDocument(request.content, request.format))
    if (ws) {
      ws.currentDocumentPath = targetPath
      ws.currentDocumentName = basename(targetPath)
    }
    knownStamps.set(targetPath, await readStamp(targetPath))
    rememberFile(targetPath)
    return { canceled: false, path: targetPath, name: basename(targetPath) }
  } catch (error) {
    notifyWindow(
      win,
      'error',
      `Impossible d’enregistrer le fichier : ${error instanceof Error ? error.message : String(error)}`
    )
    return { canceled: true }
  }
})

ipcMain.handle(
  'dialog:export-html',
  (event, request: ExportHtmlRequest): Promise<ExportHtmlResult> =>
    exportHtml(request, BrowserWindow.fromWebContents(event.sender) ?? undefined)
)

ipcMain.handle(
  'dialog:export-pdf',
  (event, request: ExportPdfRequest): Promise<ExportPdfResult> =>
    exportPdf(request, BrowserWindow.fromWebContents(event.sender) ?? undefined)
)

ipcMain.handle('workspace:open', async (event): Promise<WorkspaceState | null> => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null
  const ws = windowStateFrom(event.sender.id)
  const picked = await dialog.showOpenDialog(win, {
    title: 'Ouvrir un dossier',
    properties: ['openDirectory']
  })
  if (picked.canceled || picked.filePaths.length === 0) return null

  const root = picked.filePaths[0]
  if (ws) ws.workspaceRoot = root
  log('info', 'Dossier ouvert', { folder: basename(root) })
  return scanWorkspace(root)
})

ipcMain.handle('workspace:get', async (event): Promise<WorkspaceState | null> => {
  const ws = windowStateFrom(event.sender.id)
  return ws?.workspaceRoot ? scanWorkspace(ws.workspaceRoot) : null
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
  for (const w of windowStates.values()) w.win.webContents.send('prefs:changed', view)
  return view
})

ipcMain.handle('workspace:close', (event): void => {
  const ws = windowStateFrom(event.sender.id)
  if (ws) ws.workspaceRoot = null
})

ipcMain.handle('dialog:confirm-discard', (event): DiscardChoice => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return 'discard'
  const ws = windowStateFrom(event.sender.id)
  const choice = dialog.showMessageBoxSync(win, {
    type: 'warning',
    buttons: ['Enregistrer', 'Ne pas enregistrer', 'Annuler'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    message: 'Enregistrer les modifications ?',
    detail: `« ${ws?.currentDocumentName ?? 'Sans titre'} » contient des modifications non enregistrées.`
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

ipcMain.handle('dialog:pick-image', async (event): Promise<string | null> => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null

  const result = await dialog.showOpenDialog(win, {
    title: 'Sélectionner une image',
    properties: ['openFile'],
    filters: IMAGE_FILTERS
  })

  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('image:import', async (event, sourcePath: string): Promise<string | null> => {
  const ws = windowStateFrom(event.sender.id)
  if (!ws?.currentDocumentPath) return null
  return importImageFile(dirname(ws.currentDocumentPath), sourcePath)
})

ipcMain.handle('image:import-buffer', async (event, bytes: Uint8Array, mimeType: string): Promise<string | null> => {
  const ws = windowStateFrom(event.sender.id)
  if (!ws?.currentDocumentPath) return null
  return importImageBuffer(dirname(ws.currentDocumentPath), bytes, mimeType)
})

ipcMain.handle('autosave:write', async (event, entries: AutosaveEntry[]): Promise<void> => {
  // Each window keeps its own drafts; the file holds the union so one window
  // never erases another window's recovery copy.
  autosaveByWindow.set(event.sender.id, Array.isArray(entries) ? entries : [])
  await flushAutosave()
})

ipcMain.handle('autosave:clear', async (event): Promise<void> => {
  autosaveByWindow.delete(event.sender.id)
  await flushAutosave()
})

ipcMain.on('log:write', (_event, level: LogLevel, message: string, meta?: unknown): void => {
  log(level, message, meta)
})

ipcMain.on('doc:set-open-paths', (event, paths: unknown) => {
  const ws = windowStateFrom(event.sender.id)
  if (!ws || !Array.isArray(paths)) return
  ws.openPaths = new Set(
    paths.filter((path): path is string => typeof path === 'string' && path.length > 0).map(pathKey)
  )
})

ipcMain.on('doc:set-meta', (event, meta: DocumentMeta) => {
  const ws = windowStateFrom(event.sender.id)
  if (!ws) return
  ws.currentDocumentName = meta.name || 'Sans titre'
  ws.currentDocumentPath = meta.path
  ws.isDirty = meta.dirty || meta.dirtyNames.length > 0
  ws.dirtyTabNames = meta.dirtyNames
  updateWindowTitle(ws)
})

ipcMain.on('app:close-now', (event) => {
  const ws = windowStateFrom(event.sender.id)
  if (!ws) return
  ws.allowClose = true
  ws.win.close()
})

async function openInitialFile(filePath: string): Promise<InitialDocument | null> {
  try {
    const document = await readDocument(filePath)
    const initial: InitialDocument = {
      path: filePath,
      name: basename(filePath),
      content: document.content,
      format: document.format,
      defaultFormat: defaultFileFormat()
    }
    knownStamps.set(filePath, await readStamp(filePath))
    rememberFile(filePath)
    if (document.fallback) pendingEncodingWarning = initial.name
    return initial
  } catch {
    return null
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
      const state = themeState()
      for (const ws of windowStates.values()) {
        ws.win.setBackgroundColor(WINDOW_BACKGROUND[resolvedTheme()])
        ws.win.webContents.send('theme:changed', state)
      }
      if (windowStates.size > 0) buildMenu()
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

    // What the first window shows: a requested draft, a file argument, or the
    // last document, in that order.
    let initialDocument: InitialDocument | null = null
    const filePath = pendingOpenFile ?? findFileArgument()
    pendingOpenFile = null
    if (filePath) {
      initialDocument = await openInitialFile(filePath)
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
      for (const document of restored.documents) {
        if (document.path) knownStamps.set(document.path, await readStamp(document.path))
      }
      log('info', 'Brouillons restaurés', { count: restored.documents.length })
    } else if (!filePath && settings.reopenLastDocument && recentFiles.length > 0) {
      // Reopen the most recent document when the app starts on its own.
      initialDocument = await openInitialFile(recentFiles[0])
      if (initialDocument) log('info', 'Dernier document rouvert', { path: recentFiles[0] })
    }

    buildMenu()
    createWindow(initialDocument)
    initialDocument = null

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    // A normal close leaves no draft: remove the file synchronously so a slow
    // process exit cannot leave a stale recovery prompt for the next launch.
    if (autosaveByWindow.size === 0) clearAutosaveSync(app.getPath('userData'))
    log('info', 'Application fermée')
    if (process.platform !== 'darwin') app.quit()
  })
}
