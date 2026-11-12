import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AutosaveEntry,
  DiscardChoice,
  DocumentMeta,
  ElectronApi,
  HistoryVersion,
  InitialDocument,
  LibraryState,
  LocaleState,
  LogLevel,
  MenuAction,
  NotifyPayload,
  OpenFileResult,
  PreferencesView,
  ExportHtmlRequest,
  ExportHtmlResult,
  ExportPdfRequest,
  ExportPdfResult,
  ReloadDocumentPayload,
  SaveFileRequest,
  SaveFileResult,
  ThemePreference,
  ThemeState,
  ViewSettings,
  WorkspaceState
} from '../shared/types'

const MENU_CHANNEL = 'menu:action'
const SAVE_AND_CLOSE_CHANNEL = 'app:save-and-close'
const RELOAD_CHANNEL = 'doc:reload'
const NOTIFY_CHANNEL = 'app:notify'
const OPEN_FILE_CHANNEL = 'app:open-file'
const THEME_CHANNEL = 'theme:changed'
const VIEW_CHANNEL = 'view:changed'
const LOCALE_CHANNEL = 'locale:changed'

const api: ElectronApi = {
  getInitialDocument: () => ipcRenderer.invoke('doc:get-initial') as Promise<InitialDocument>,
  getLibrary: () => ipcRenderer.invoke('library:get') as Promise<LibraryState>,
  openLibraryFolder: () => ipcRenderer.invoke('library:open-folder') as Promise<void>,
  openFile: () => ipcRenderer.invoke('dialog:open') as Promise<OpenFileResult>,
  openFileAt: (path: string) => ipcRenderer.invoke('open:path', path) as Promise<OpenFileResult>,
  importDocx: () => ipcRenderer.invoke('dialog:import-docx') as Promise<OpenFileResult>,
  openFolder: () => ipcRenderer.invoke('workspace:open') as Promise<WorkspaceState | null>,
  getWorkspace: () => ipcRenderer.invoke('workspace:get') as Promise<WorkspaceState | null>,
  closeWorkspace: () => ipcRenderer.invoke('workspace:close') as Promise<void>,
  getPreferences: () => ipcRenderer.invoke('prefs:get') as Promise<PreferencesView>,
  setPreferences: (patch: Partial<PreferencesView>) =>
    ipcRenderer.invoke('prefs:set', patch) as Promise<PreferencesView>,
  onPreferencesChanged: (callback: (preferences: PreferencesView) => void) => {
    const listener = (_event: unknown, preferences: PreferencesView) => callback(preferences)
    ipcRenderer.on('prefs:changed', listener)
    return () => ipcRenderer.removeListener('prefs:changed', listener)
  },
  getLocale: () => ipcRenderer.invoke('locale:get') as Promise<LocaleState>,
  onLocaleChanged: (callback: (state: LocaleState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: LocaleState): void => callback(state)
    ipcRenderer.on(LOCALE_CHANNEL, listener)
    return () => ipcRenderer.removeListener(LOCALE_CHANNEL, listener)
  },
  listHistory: (path: string) => ipcRenderer.invoke('history:list', path) as Promise<HistoryVersion[]>,
  readHistory: (path: string, id: string) =>
    ipcRenderer.invoke('history:read', path, id) as Promise<string | null>,
  saveFile: (request: SaveFileRequest) =>
    ipcRenderer.invoke('dialog:save', request) as Promise<SaveFileResult>,
  exportHtml: (request: ExportHtmlRequest) =>
    ipcRenderer.invoke('dialog:export-html', request) as Promise<ExportHtmlResult>,
  exportPdf: (request: ExportPdfRequest) =>
    ipcRenderer.invoke('dialog:export-pdf', request) as Promise<ExportPdfResult>,
  confirmDiscard: () => ipcRenderer.invoke('dialog:confirm-discard') as Promise<DiscardChoice>,
  setDocumentMeta: (meta: DocumentMeta) => ipcRenderer.send('doc:set-meta', meta),
  setOpenPaths: (paths: string[]) => ipcRenderer.send('doc:set-open-paths', paths),
  closeWindow: () => ipcRenderer.send('app:close-now'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url) as Promise<void>,
  writeClipboard: (text: string) =>
    ipcRenderer.invoke('clipboard:write-text', text) as Promise<void>,
  readClipboard: () => ipcRenderer.invoke('clipboard:read-text') as Promise<string>,
  getTheme: () => ipcRenderer.invoke('theme:get') as Promise<ThemeState>,
  setTheme: (preference: ThemePreference) =>
    ipcRenderer.invoke('theme:set', preference) as Promise<ThemeState>,
  onThemeChanged: (callback: (state: ThemeState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: ThemeState): void => callback(state)
    ipcRenderer.on(THEME_CHANNEL, listener)
    return () => ipcRenderer.removeListener(THEME_CHANNEL, listener)
  },
  getViewSettings: () => ipcRenderer.invoke('view:get') as Promise<ViewSettings>,
  setViewSettings: (settings: Partial<ViewSettings>) =>
    ipcRenderer.invoke('view:set', settings) as Promise<ViewSettings>,
  onViewSettingsChanged: (callback: (settings: ViewSettings) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: ViewSettings): void =>
      callback(settings)
    ipcRenderer.on(VIEW_CHANNEL, listener)
    return () => ipcRenderer.removeListener(VIEW_CHANNEL, listener)
  },
  pickImage: () => ipcRenderer.invoke('dialog:pick-image') as Promise<string | null>,
  importImage: (sourcePath: string) =>
    ipcRenderer.invoke('image:import', sourcePath) as Promise<string | null>,
  importImageBuffer: (bytes: Uint8Array, mimeType: string) =>
    ipcRenderer.invoke('image:import-buffer', bytes, mimeType) as Promise<string | null>,
  onMenuAction: (callback: (action: MenuAction) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: MenuAction): void => callback(action)
    ipcRenderer.on(MENU_CHANNEL, listener)
    return () => ipcRenderer.removeListener(MENU_CHANNEL, listener)
  },
  onSaveAndClose: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(SAVE_AND_CLOSE_CHANNEL, listener)
    return () => ipcRenderer.removeListener(SAVE_AND_CLOSE_CHANNEL, listener)
  },
  onDocumentReload: (callback: (document: ReloadDocumentPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, document: ReloadDocumentPayload): void =>
      callback(document)
    ipcRenderer.on(RELOAD_CHANNEL, listener)
    return () => ipcRenderer.removeListener(RELOAD_CHANNEL, listener)
  },
  newWindow: () => ipcRenderer.invoke('window:new') as Promise<void>,
  saveAutosave: (entries: AutosaveEntry[]) =>
    ipcRenderer.invoke('autosave:write', entries) as Promise<void>,
  clearAutosave: () => ipcRenderer.invoke('autosave:clear') as Promise<void>,
  onNotify: (callback: (payload: NotifyPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: NotifyPayload): void =>
      callback(payload)
    ipcRenderer.on(NOTIFY_CHANNEL, listener)
    return () => ipcRenderer.removeListener(NOTIFY_CHANNEL, listener)
  },
  log: (level: LogLevel, message: string, meta?: unknown) =>
    ipcRenderer.send('log:write', level, message, meta),
  onOpenFile: (callback: (path: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, path: string): void => callback(path)
    ipcRenderer.on(OPEN_FILE_CHANNEL, listener)
    return () => ipcRenderer.removeListener(OPEN_FILE_CHANNEL, listener)
  },
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)
