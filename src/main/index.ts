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
import type {
  FileFilter,
  MenuItemConstructorOptions,
  MessageBoxSyncOptions,
  OpenDialogOptions
} from 'electron'
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
  Language,
  LocaleState,
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
import { applySpellcheck, buildContextMenu } from './spellcheck'
import { DOCUMENT_FONT_OPTIONS, DEFAULT_TYPOGRAPHY, FONT_SIZE_MAX, FONT_SIZE_MIN } from '../shared/typography'
import { createTranslator, localeTag, resolveLanguage } from '../shared/i18n'
import type { TranslationKey, TranslationParams } from '../shared/i18n'
import { spellLanguageOptions } from '../shared/spellLanguages'

const APP_NAME = 'Cyonima MD Editor'

/** Window background colours used before the renderer has painted. */
const WINDOW_BACKGROUND = { light: '#eceae3', dark: '#171614' } as const

/**
 * Language actually displayed: the explicit preference, or the operating
 * system language mapped onto the two translated languages (anything else
 * falls back to French).
 */
let systemLocale = 'en-US'

function currentLanguage(): Language {
  return resolveLanguage(settings.language, systemLocale)
}

function localeState(): LocaleState {
  return {
    preference: settings.language,
    language: currentLanguage(),
    systemLocale
  }
}

function t(key: TranslationKey, params?: TranslationParams): string {
  return createTranslator(currentLanguage())(key, params)
}

function currentLocaleTag(): string {
  return localeTag(currentLanguage(), systemLocale)
}

function pageWidthOptions(): Array<{ value: PageWidth; label: string }> {
  return [
    { value: 'narrow', label: t('layout.width.narrow') },
    { value: 'normal', label: t('layout.width.normal') },
    { value: 'wide', label: t('layout.width.wide') },
    { value: 'full', label: t('layout.width.full') }
  ]
}

const FONT_SIZE_OPTIONS = Array.from(
  { length: FONT_SIZE_MAX - FONT_SIZE_MIN + 1 },
  (_, index) => FONT_SIZE_MIN + index
)

function lineHeightOptions(): Array<{ value: number; label: string }> {
  return [
    { value: 1.4, label: t('layout.spacing.tight') },
    { value: 1.7, label: t('layout.spacing.normal') },
    { value: 2, label: t('layout.spacing.airy') }
  ]
}

function paragraphSpacingOptions(): Array<{ value: number; label: string }> {
  return [
    { value: 0.5, label: t('layout.paragraphSpacing.compact') },
    { value: 1, label: t('layout.paragraphSpacing.normal') },
    { value: 1.5, label: t('layout.paragraphSpacing.airy') }
  ]
}

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
function imageFilters(): FileFilter[] {
  return [
    { name: t('dialog.filter.images'), extensions: IMAGE_EXTENSIONS },
    { name: t('dialog.filter.allFiles'), extensions: ['*'] }
  ]
}
const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'txt']
function markdownFilters(): FileFilter[] {
  return [
    { name: t('dialog.filter.markdown'), extensions: MARKDOWN_EXTENSIONS },
    { name: t('dialog.filter.allFiles'), extensions: ['*'] }
  ]
}

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
    buttons: [t('dialog.continue')],
    defaultId: 0,
    noLink: true,
    message: t('dialog.encoding.title'),
    detail: t('dialog.encoding.detail', { file: fileName })
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
    buttons: [t('dialog.autosave.restore'), t('dialog.autosave.discard')],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    message: t('dialog.autosave.title'),
    detail: t('dialog.autosave.detail', {
      date: new Date(draft.savedAt).toLocaleString(currentLocaleTag())
    })
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

  const conflictButtons = [
    t('dialog.conflict.reload'),
    t('dialog.conflict.overwrite'),
    t('dialog.conflict.saveAs'),
    t('dialog.conflict.cancel')
  ]

  const options: MessageBoxSyncOptions = otherWindowTitle
    ? {
        type: 'warning',
        buttons: conflictButtons,
        defaultId: 3,
        cancelId: 3,
        noLink: true,
        message: t('dialog.conflict.otherWindow.title'),
        detail: t('dialog.conflict.otherWindow.detail', {
          file: fileName,
          window: otherWindowTitle
        })
      }
    : {
        type: 'warning',
        buttons: conflictButtons,
        defaultId: 1,
        cancelId: 3,
        noLink: true,
        message: t('dialog.conflict.external.title'),
        detail: t('dialog.conflict.external.detail', { file: fileName })
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
  if (names.length === 1) return t('dialog.close.detailOne', { name: names[0] })
  const [open, close] = currentLanguage() === 'fr' ? ['« ', ' »'] : ['“', '”']
  return t('dialog.close.detailMany', {
    count: names.length,
    names: names.map((name) => `${open}${name}${close}`).join(', ')
  })
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

/** Sends the resolved language to every window and rebuilds the native menus. */
function broadcastLocale(): void {
  const state = localeState()
  for (const ws of windowStates.values()) {
    if (!ws.win.isDestroyed()) ws.win.webContents.send('locale:changed', state)
  }
  buildMenu()
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
    return [{ label: t('menu.noRecent'), enabled: false }]
  }

  const items: MenuItemConstructorOptions[] = existing.map((path) => ({
    label: basename(path),
    toolTip: path,
    click: () => openRecentFile(path)
  }))

  items.push({ type: 'separator' })
  items.push({
    label: t('menu.clearRecent'),
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
    title: t('notify.exportHtmlTitle'),
    defaultPath: `${baseName}.html`,
    filters: [{ name: t('dialog.filter.html'), extensions: ['html', 'htm'] }]
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
        t('notify.exportMissing', {
          count: embedded.missing.length,
          names: embedded.missing.join(', ')
        })
      )
    } else {
      notifyWindow(
        target,
        'success',
        t('notify.exportHtmlSaved', { name: basename(targetPath) })
      )
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
      t('notify.exportHtmlFailed', {
        message: error instanceof Error ? error.message : String(error)
      })
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
    title: t('notify.exportPdfTitle'),
    defaultPath: `${baseName}.pdf`,
    filters: [{ name: t('dialog.filter.pdf'), extensions: ['pdf'] }]
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
      targetPath,
      language: currentLanguage()
    })

    if (missing.length > 0) {
      notify(
        'warning',
        t('notify.exportMissing', { count: missing.length, names: missing.join(', ') })
      )
    } else {
      notify('success', t('notify.exportPdfSaved', { name: basename(targetPath) }))
    }

    return {
      canceled: false,
      path: targetPath,
      missingImages: missing.length > 0 ? missing : undefined
    }
  } catch (error) {
    notify(
      'error',
      t('notify.exportPdfFailed', {
        message: error instanceof Error ? error.message : String(error)
      })
    )
    return { canceled: true }
  }
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const spellLanguages = spellLanguageOptions(currentLanguage())

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: 'about', label: t('menu.about', { app: APP_NAME }) },
              { type: 'separator' },
              { role: 'hide', label: t('menu.hide') },
              { role: 'hideOthers', label: t('menu.hideOthers') },
              { role: 'unhide', label: t('menu.unhide') },
              { type: 'separator' },
              { role: 'quit', label: t('menu.quit') }
            ]
          } as MenuItemConstructorOptions
        ]
      : []),
    {
      label: t('menu.file'),
      submenu: [
        {
          label: t('menu.newDocument'),
          accelerator: 'CmdOrCtrl+N',
          click: () => sendMenuAction('new')
        },
        {
          label: t('menu.newWindow'),
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => sendMenuAction('new-window')
        },
        {
          label: t('menu.openInNewWindow'),
          click: () => void openFileInNewWindow()
        },
        {
          label: t('menu.open'),
          accelerator: 'CmdOrCtrl+O',
          click: () => sendMenuAction('open')
        },
        {
          label: t('menu.openFolder'),
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendMenuAction('open-folder')
        },
        {
          label: t('menu.openRecent'),
          submenu: buildRecentMenu()
        },
        {
          label: t('menu.importWord'),
          click: () => sendMenuAction('import')
        },
        { type: 'separator' },
        {
          label: t('menu.save'),
          accelerator: 'CmdOrCtrl+S',
          click: () => sendMenuAction('save')
        },
        {
          label: t('menu.saveAs'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendMenuAction('save-as')
        },
        { type: 'separator' },
        {
          label: t('menu.closeTab'),
          accelerator: 'CmdOrCtrl+W',
          click: () => sendMenuAction('close-tab')
        },
        {
          label: t('menu.nextTab'),
          accelerator: 'Ctrl+Tab',
          click: () => sendMenuAction('next-tab')
        },
        {
          label: t('menu.prevTab'),
          accelerator: 'Ctrl+Shift+Tab',
          click: () => sendMenuAction('prev-tab')
        },
        { type: 'separator' },
        {
          label: t('menu.frontmatter'),
          click: () => sendMenuAction('frontmatter')
        },
        {
          label: t('menu.history'),
          click: () => sendMenuAction('history')
        },
        {
          label: t('menu.preferences'),
          click: () => sendMenuAction('preferences')
        },
        { type: 'separator' },
        {
          label: t('menu.exportHtml'),
          click: () => sendMenuAction('export-html')
        },
        {
          label: t('menu.exportPdf'),
          click: () => sendMenuAction('export-pdf')
        },
        {
          label: t('menu.print'),
          accelerator: 'CmdOrCtrl+P',
          click: () => focusedWindowState()?.win.webContents.print({ printBackground: true })
        },
        { type: 'separator' },
        {
          label: t('menu.reopenLast'),
          type: 'checkbox',
          checked: settings.reopenLastDocument,
          click: (item) => {
            settings = { ...settings, reopenLastDocument: item.checked }
            saveSettings(app.getPath('userData'), settings)
          }
        },
        isMac
          ? { role: 'close', label: t('menu.closeWindow') }
          : { role: 'quit', label: t('menu.quit') }
      ]
    },
    {
      label: t('menu.edit'),
      submenu: [
        {
          label: t('menu.undo'),
          accelerator: 'CmdOrCtrl+Z',
          click: () => sendMenuAction('undo')
        },
        {
          label: t('menu.redo'),
          accelerator: isMac ? 'CmdOrCtrl+Shift+Z' : 'CmdOrCtrl+Y',
          click: () => sendMenuAction('redo')
        },
        { type: 'separator' },
        { role: 'cut', label: t('menu.cut') },
        { role: 'copy', label: t('menu.copy') },
        { role: 'paste', label: t('menu.paste') },
        { role: 'selectAll', label: t('menu.selectAll') },
        { type: 'separator' },
        {
          label: t('menu.find'),
          accelerator: 'CmdOrCtrl+F',
          click: () => sendMenuAction('find')
        },
        { type: 'separator' },
        {
          label: t('menu.spelling'),
          submenu: [
            {
              label: t('menu.spellCheck'),
              type: 'checkbox',
              checked: settings.spellCheck,
              click: (item) => setSpellSettings({ spellCheck: item.checked })
            },
            { type: 'separator' },
            ...spellLanguages.map((option) => ({
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
      label: t('menu.format'),
      submenu: [
        {
          label: t('menu.bold'),
          accelerator: 'CmdOrCtrl+B',
          click: () => sendMenuAction('bold')
        },
        {
          label: t('menu.italic'),
          accelerator: 'CmdOrCtrl+I',
          click: () => sendMenuAction('italic')
        },
        {
          label: t('menu.underline'),
          accelerator: 'CmdOrCtrl+U',
          click: () => sendMenuAction('underline')
        },
        {
          label: t('menu.strike'),
          accelerator: 'CmdOrCtrl+Shift+X',
          click: () => sendMenuAction('strike')
        },
        {
          label: t('menu.inlineCode'),
          accelerator: 'CmdOrCtrl+E',
          click: () => sendMenuAction('code')
        },
        { type: 'separator' },
        {
          label: t('menu.link'),
          accelerator: 'CmdOrCtrl+K',
          click: () => sendMenuAction('link')
        }
      ]
    },
    {
      label: t('menu.view'),
      submenu: [
        {
          label: t('menu.theme'),
          submenu: [
            {
              label: t('menu.themeSystem'),
              type: 'radio',
              checked: settings.theme === 'system',
              click: () => {
                applyTheme('system')
                buildMenu()
              }
            },
            {
              label: t('menu.themeLight'),
              type: 'radio',
              checked: settings.theme === 'light',
              click: () => {
                applyTheme('light')
                buildMenu()
              }
            },
            {
              label: t('menu.themeDark'),
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
          label: t('menu.focusMode'),
          type: 'checkbox',
          checked: settings.focusMode,
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => {
            applyViewSettings({ focusMode: !settings.focusMode })
            buildMenu()
          }
        },
        {
          label: t('menu.typewriter'),
          type: 'checkbox',
          checked: settings.typewriterMode,
          click: () => {
            applyViewSettings({ typewriterMode: !settings.typewriterMode })
            buildMenu()
          }
        },
        {
          label: t('menu.pageWidth'),
          submenu: pageWidthOptions().map((option) => ({
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
          label: t('menu.typography'),
          submenu: [
            {
              label: t('menu.font'),
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
              label: t('menu.fontSize'),
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
              label: t('menu.lineHeight'),
              submenu: lineHeightOptions().map((option) => ({
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
              label: t('menu.paragraphSpacing'),
              submenu: paragraphSpacingOptions().map((option) => ({
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
        { role: 'resetZoom', label: t('menu.actualSize') },
        { role: 'zoomIn', label: t('menu.zoomIn') },
        { role: 'zoomOut', label: t('menu.zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t('menu.fullscreen') },
        ...(app.isPackaged
          ? []
          : ([
              { type: 'separator' },
              { role: 'reload', label: t('menu.reload') },
              { role: 'toggleDevTools', label: t('menu.devTools') }
            ] as MenuItemConstructorOptions[]))
      ]
    },
    {
      label: t('menu.help'),
      submenu: [
        {
          label: t('menu.shortcuts'),
          accelerator: 'CmdOrCtrl+/',
          click: () => sendMenuAction('shortcuts')
        },
        { type: 'separator' },
        {
          label: t('menu.openLog'),
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
    currentDocumentName: t('common.untitled'),
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
          added ? t('notify.wordAdded', { word }) : t('notify.wordAddFailed', { word })
        )
      }
    }, currentLanguage())
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
      buttons: [
        t('dialog.saveChanges.save'),
        t('dialog.saveChanges.discard'),
        t('dialog.saveChanges.cancel')
      ],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      message: t('dialog.close.title'),
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
    notify(
      'error',
      t('notify.openFailed', {
        message: error instanceof Error ? error.message : String(error)
      })
    )
    createWindow()
  }
}

/** Fichier → « Ouvrir dans une nouvelle fenêtre… ». */
async function openFileInNewWindow(): Promise<void> {
  const win = focusedWindowState()?.win
  const options: OpenDialogOptions = {
    title: t('dialog.openNewWindow.title'),
    properties: ['openFile'],
    filters: markdownFilters()
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
    name: t('common.untitled'),
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
    title: t('dialog.pandoc.title'),
    message: t('dialog.pandoc.message'),
    detail: t('dialog.pandoc.detail'),
    buttons: [t('dialog.pandoc.openPage'), t('dialog.pandoc.cancel')],
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
    notifyWindow(win, 'warning', t('notify.importEmpty'))
  }
  if (conversion.unsupportedImages.length > 0) {
    notifyWindow(
      win,
      'warning',
      t('notify.importImagesUnsupported', {
        names: conversion.unsupportedImages.join(', ')
      })
    )
  }
  if (conversion.mediaFolder) {
    notifyWindow(win, 'info', t('notify.imagesExtracted', { folder: conversion.mediaFolder }))
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
    title: t('dialog.import.title'),
    properties: ['openFile'],
    filters: [{ name: t('dialog.filter.word'), extensions: ['docx'] }]
  })
  if (picked.canceled || picked.filePaths.length === 0) return { canceled: true }

  const docxPath = picked.filePaths[0]
  const suggestedPath = join(dirname(docxPath), `${basename(docxPath, extname(docxPath))}.md`)
  const target = await dialog.showSaveDialog(win, {
    title: t('dialog.import.saveTitle'),
    defaultPath: suggestedPath,
    filters: markdownFilters()
  })
  if (target.canceled || !target.filePath) return { canceled: true }

  // Some save dialogs do not append the filter's extension.
  const targetPath = extname(target.filePath) ? target.filePath : `${target.filePath}.md`

  if (resolve(targetPath) === resolve(docxPath)) {
    notifyWindow(win, 'error', t('notify.importCannotReplace'))
    return { canceled: true }
  }
  if (extname(targetPath).toLowerCase() === '.docx') {
    notifyWindow(win, 'error', t('notify.importChooseMarkdown'))
    return { canceled: true }
  }

  try {
    return await importDocxAt(docxPath, targetPath, win)
  } catch (error) {
    notifyWindow(
      win,
      'error',
      t('notify.importFailed', {
        message: error instanceof Error ? error.message : String(error)
      })
    )
    return { canceled: true }
  }
})

ipcMain.handle('dialog:open', async (event): Promise<OpenFileResult> => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { canceled: true }

  const result = await dialog.showOpenDialog(win, {
    title: t('dialog.openMarkdown.title'),
    properties: ['openFile'],
    filters: markdownFilters()
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
      t('notify.openFailed', {
        message: error instanceof Error ? error.message : String(error)
      })
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
        title: t('dialog.saveDocument.title'),
        defaultPath: request.path ?? `${ws?.currentDocumentName ?? t('common.untitled')}.md`,
        filters: markdownFilters()
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
      t('notify.saveFailed', {
        message: error instanceof Error ? error.message : String(error)
      })
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
    title: t('dialog.openFolder.title'),
    properties: ['openDirectory']
  })
  if (picked.canceled || picked.filePaths.length === 0) return null

  const root = picked.filePaths[0]
  if (ws) ws.workspaceRoot = root
  log('info', 'Dossier ouvert', { folder: basename(root) })
  return scanWorkspace(root, currentLocaleTag())
})

ipcMain.handle('workspace:get', async (event): Promise<WorkspaceState | null> => {
  const ws = windowStateFrom(event.sender.id)
  return ws?.workspaceRoot ? scanWorkspace(ws.workspaceRoot, currentLocaleTag()) : null
})

ipcMain.handle('locale:get', (): LocaleState => localeState())

ipcMain.handle('prefs:get', (): PreferencesView => pickPreferences(settings))

ipcMain.handle('prefs:set', (_event, patch: unknown): PreferencesView => {
  const changes = sanitizePreferencesPatch(patch)
  settings = normalizeSettings({ ...settings, ...changes })
  saveSettings(app.getPath('userData'), settings)
  if ('spellCheck' in changes || 'spellLanguage' in changes) applySpellSettings()
  const languageChanged = 'language' in changes
  if (
    'spellCheck' in changes ||
    'spellLanguage' in changes ||
    'reopenLastDocument' in changes ||
    languageChanged
  ) {
    buildMenu()
  }
  const view = pickPreferences(settings)
  for (const w of windowStates.values()) w.win.webContents.send('prefs:changed', view)
  if (languageChanged) broadcastLocale()
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
    buttons: [
      t('dialog.saveChanges.save'),
      t('dialog.saveChanges.discard'),
      t('dialog.saveChanges.cancel')
    ],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    message: t('dialog.close.title'),
    detail: t('dialog.close.detailOne', {
      name: ws?.currentDocumentName ?? t('common.untitled')
    })
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
    title: t('dialog.pickImage.title'),
    properties: ['openFile'],
    filters: imageFilters()
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
  ws.currentDocumentName = meta.name || t('common.untitled')
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

    systemLocale = app.getLocale() || systemLocale
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
        name: document.name || t('common.untitled'),
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
