import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import type {
  DiscardChoice,
  DocumentMeta,
  InitialDocument,
  MenuAction,
  OpenFileResult,
  SaveFileRequest,
  SaveFileResult
} from '../shared/types'

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

async function readDocument(filePath: string): Promise<InitialDocument> {
  const content = await readFile(filePath, 'utf8')
  return { path: filePath, name: basename(filePath), content }
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
  return initialDocument ?? { path: null, name: 'Sans titre', content: '' }
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
    const content = await readFile(filePath, 'utf8')
    return { canceled: false, path: filePath, name: basename(filePath), content }
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
    await writeFile(targetPath, request.content, 'utf8')
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
        initialDocument = await readDocument(filePath)
        currentDocumentName = initialDocument.name
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
