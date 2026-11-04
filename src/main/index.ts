import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions, MessageBoxSyncOptions } from 'electron'
import { statSync } from 'fs'
import { readFile, stat, writeFile } from 'fs/promises'
import { basename, extname, join, resolve } from 'path'
import type {
  AutosaveRecord,
  AutosaveRequest,
  DiscardChoice,
  DocumentMeta,
  FileFormat,
  InitialDocument,
  LogLevel,
  MenuAction,
  NotifyLevel,
  OpenFileResult,
  ReloadDocumentPayload,
  SaveFileRequest,
  SaveFileResult
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
import { loadSettings, saveSettings } from './settings'
import type { AppSettings } from './settings'

const APP_NAME = 'Cyonima MD Editor'
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
let knownFileStamp: FileStamp | null = null
let recentFiles: string[] = []
let settings: AppSettings = { reopenLastDocument: true }

const gotSingleInstanceLock = app.requestSingleInstanceLock()

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
  knownFileStamp = await readStamp(filePath)

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

async function exportPdf(): Promise<void> {
  if (!mainWindow) return

  const baseName = currentDocumentName.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '')
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter en PDF',
    defaultPath: `${baseName || 'document'}.pdf`,
    filters: [{ name: 'Document PDF', extensions: ['pdf'] }]
  })

  if (result.canceled || !result.filePath) return

  try {
    const pdf = await mainWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4'
    })
    await writeFile(result.filePath, pdf)
  } catch (error) {
    notify('error', `Impossible d’exporter le PDF : ${error instanceof Error ? error.message : String(error)}`)
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
          label: 'Ouvrir récent',
          submenu: buildRecentMenu()
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
          label: 'Exporter en PDF…',
          click: () => void exportPdf()
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
    backgroundColor: '#eceae3',
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
      detail: `« ${currentDocumentName} » contient des modifications non enregistrées.`
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
  knownFileStamp = await readStamp(filePath)
  rememberFile(filePath)
  return {
    canceled: false,
    path: filePath,
    name: basename(filePath),
    content: document.content,
    format: document.format
  }
}

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

ipcMain.handle('dialog:save', async (_event, request: SaveFileRequest): Promise<SaveFileResult> => {
  if (!mainWindow) return { canceled: true }

  let targetPath = request.saveAs ? null : request.path

  // Detect changes made outside the editor before overwriting in place.
  if (targetPath && !request.saveAs && targetPath === currentDocumentPath && knownFileStamp) {
    const onDisk = await readStamp(targetPath)
    if (stampChanged(knownFileStamp, onDisk)) {
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
    await writeFileAtomic(targetPath, encodeDocument(request.content, request.format))
    currentDocumentPath = targetPath
    knownFileStamp = await readStamp(targetPath)
    rememberFile(targetPath)
    return { canceled: false, path: targetPath, name: basename(targetPath) }
  } catch (error) {
    notify('error', `Impossible d’enregistrer le fichier : ${error instanceof Error ? error.message : String(error)}`)
    return { canceled: true }
  }
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

ipcMain.handle('autosave:write', async (_event, request: AutosaveRequest): Promise<void> => {
  await writeAutosave(app.getPath('userData'), { ...request, savedAt: Date.now() })
})

ipcMain.handle('autosave:clear', async (): Promise<void> => {
  await clearAutosave(app.getPath('userData'))
})

ipcMain.on('log:write', (_event, level: LogLevel, message: string, meta?: unknown): void => {
  log(level, message, meta)
})

ipcMain.on('doc:set-meta', (_event, meta: DocumentMeta) => {
  currentDocumentName = meta.name || 'Sans titre'
  isDirty = meta.dirty
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
    knownFileStamp = await readStamp(filePath)
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

    settings = loadSettings(app.getPath('userData'))
    recentFiles = filterExistingFiles(loadRecentFiles(app.getPath('userData')))

    // Offer to recover an unsaved draft left behind by a previous crash.
    let restored: AutosaveRecord | null = null
    const draft = readAutosaveSync(app.getPath('userData'))
    if (draft && draft.content.length > 0) {
      const choice = chooseAutosaveResolution(draft)
      if (choice === 'restore') restored = draft
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
      initialDocument = {
        path: restored.path,
        name: restored.name || 'Sans titre',
        content: restored.content,
        format: restored.format,
        defaultFormat: defaultFileFormat(),
        unsaved: true
      }
      currentDocumentPath = restored.path
      currentDocumentName = restored.name || 'Sans titre'
      knownFileStamp = restored.path ? await readStamp(restored.path) : null
      isDirty = true
      log('info', 'Brouillon restauré', { path: restored.path, name: restored.name })
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
