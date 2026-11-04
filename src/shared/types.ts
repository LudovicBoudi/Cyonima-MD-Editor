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

export type TextEncoding = 'utf-8' | 'utf-16le' | 'utf-16be'
export type LineEnding = 'lf' | 'crlf'

/**
 * On-disk text format of a document. The renderer always works with LF
 * internally; this metadata is what lets the main process restore the original
 * encoding, BOM and line endings when saving.
 */
export interface FileFormat {
  encoding: TextEncoding
  bom: boolean
  eol: LineEnding
}

export interface InitialDocument {
  path: string | null
  name: string
  content: string
  format: FileFormat
  /** Format to use for documents created from scratch. */
  defaultFormat: FileFormat
}

export interface OpenFileResult {
  canceled: boolean
  path?: string
  name?: string
  content?: string
  format?: FileFormat
}

export interface SaveFileRequest {
  content: string
  path: string | null
  saveAs?: boolean
  format?: FileFormat
}

export interface SaveFileResult {
  canceled: boolean
  path?: string
  name?: string
}

export interface ReloadDocumentPayload {
  path: string | null
  name: string
  content: string
  format: FileFormat
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
  onDocumentReload: (callback: (document: ReloadDocumentPayload) => void) => () => void
}
