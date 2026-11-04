import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions, MessageBoxSyncOptions } from 'electron'
import { existsSync } from 'fs'
import { readFile, stat, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import type {
  DiscardChoice,
  DocumentMeta,
  FileFormat,
  InitialDocument,
  MenuAction,
  OpenFileResult,
  ReloadDocumentPayload,
  SaveFileRequest,
  SaveFileResult
} from '../shared/types'
import { decodeDocument, defaultFileFormat, encodeDocument } from './fileFormat'
import { writeFileAtomic } from './atomicWrite'
import { stampChanged } from './fileStamp'
import type { FileStamp } from './fileStamp'

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

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

function findFileArgument(): string | null {
  const args = process.argv.slice(1)
  for (const arg of args) {
    if (arg.startsWith('-')) continue
    if (MARKDOWN_EXTENSIONS.includes(extname(arg).slice(1).toLowerCase()) && existsSync(arg)) {
      return arg
    }
  }
  return null
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
    dialog.showErrorBox(
      'Impossible d’exporter le PDF',
      error instanceof Error ? error.message : String(error)
    )
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
        { role: 'selectAll', label: 'Tout sélectionner' }
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

  const filePath = result.filePaths[0]
  try {
    const document = await readDocument(filePath)
    if (document.fallback) showEncodingWarning(basename(filePath))
    currentDocumentPath = filePath
    knownFileStamp = await readStamp(filePath)
    return {
      canceled: false,
      path: filePath,
      name: basename(filePath),
      content: document.content,
      format: document.format
    }
  } catch (error) {
    dialog.showErrorBox(
      'Impossible d’ouvrir le fichier',
      error instanceof Error ? error.message : String(error)
    )
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
    return { canceled: false, path: targetPath, name: basename(targetPath) }
  } catch (error) {
    dialog.showErrorBox(
      'Impossible d’enregistrer le fichier',
      error instanceof Error ? error.message : String(error)
    )
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

ipcMain.on('doc:set-meta', (_event, meta: DocumentMeta) => {
  currentDocumentName = meta.name || 'Sans titre'
  isDirty = meta.dirty
  updateWindowTitle()
})

ipcMain.on('app:close-now', () => {
  allowClose = true
  mainWindow?.close()
})

if (gotSingleInstanceLock) {
  app.whenReady().then(async () => {
    const filePath = findFileArgument()
    if (filePath) {
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
        if (document.fallback) pendingEncodingWarning = initialDocument.name
      } catch {
        initialDocument = null
      }
    }

    buildMenu()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
