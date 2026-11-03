export type MenuAction =
  | 'new'
  | 'open'
  | 'save'
  | 'save-as'
  | 'undo'
  | 'redo'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'link'

export interface InitialDocument {
  path: string | null
  name: string
  content: string
}

export interface OpenFileResult {
  canceled: boolean
  path?: string
  name?: string
  content?: string
}

export interface SaveFileRequest {
  content: string
  path: string | null
  saveAs?: boolean
}

export interface SaveFileResult {
  canceled: boolean
  path?: string
  name?: string
}

export type DiscardChoice = 'save' | 'discard' | 'cancel'

export interface DocumentMeta {
  name: string
  path: string | null
  dirty: boolean
}

export interface ElectronApi {
  getInitialDocument: () => Promise<InitialDocument>
  openFile: () => Promise<OpenFileResult>
  saveFile: (request: SaveFileRequest) => Promise<SaveFileResult>
  confirmDiscard: () => Promise<DiscardChoice>
  setDocumentMeta: (meta: DocumentMeta) => void
  closeWindow: () => void
  openExternal: (url: string) => Promise<void>
  onMenuAction: (callback: (action: MenuAction) => void) => () => void
  onSaveAndClose: (callback: () => void) => () => void
}
