import { contextBridge, ipcRenderer } from 'electron'
import type {
  DiscardChoice,
  DocumentMeta,
  ElectronApi,
  InitialDocument,
  MenuAction,
  OpenFileResult,
  ReloadDocumentPayload,
  SaveFileRequest,
  SaveFileResult
} from '../shared/types'

const MENU_CHANNEL = 'menu:action'
const SAVE_AND_CLOSE_CHANNEL = 'app:save-and-close'
const RELOAD_CHANNEL = 'doc:reload'

const api: ElectronApi = {
  getInitialDocument: () => ipcRenderer.invoke('doc:get-initial') as Promise<InitialDocument>,
  openFile: () => ipcRenderer.invoke('dialog:open') as Promise<OpenFileResult>,
  saveFile: (request: SaveFileRequest) =>
    ipcRenderer.invoke('dialog:save', request) as Promise<SaveFileResult>,
  confirmDiscard: () => ipcRenderer.invoke('dialog:confirm-discard') as Promise<DiscardChoice>,
  setDocumentMeta: (meta: DocumentMeta) => ipcRenderer.send('doc:set-meta', meta),
  closeWindow: () => ipcRenderer.send('app:close-now'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url) as Promise<void>,
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
  }
}

contextBridge.exposeInMainWorld('api', api)
