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
  /** True when the content comes from a recovered draft (not yet saved). */
  unsaved?: boolean
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

export interface AutosaveRequest {
  path: string | null
  name: string
  content: string
  format: FileFormat
}

export interface AutosaveRecord extends AutosaveRequest {
  savedAt: number
}

export type DiscardChoice = 'save' | 'discard' | 'cancel'

export type LogLevel = 'info' | 'warn' | 'error'
export type NotifyLevel = 'info' | 'success' | 'warning' | 'error'

export interface NotifyPayload {
  level: NotifyLevel
  message: string
  at: number
}

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
  saveAutosave: (request: AutosaveRequest) => Promise<void>
  clearAutosave: () => Promise<void>
  onNotify: (callback: (payload: NotifyPayload) => void) => () => void
  log: (level: LogLevel, message: string, meta?: unknown) => void
}
