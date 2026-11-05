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
  | 'find'

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

/** User-facing theme choice. `system` follows the OS setting. */
export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export type PageWidth = 'narrow' | 'normal' | 'wide' | 'full'
export type DocumentFont = 'serif' | 'sans' | 'mono'

export interface TypographySettings {
  fontFamily: DocumentFont
  /** Base document font size in pixels. */
  fontSize: number
  /** Unitless line height. */
  lineHeight: number
  /** Space between paragraphs, in em. */
  paragraphSpacing: number
}

export interface ViewSettings extends TypographySettings {
  /** Hide the header, toolbar and status bar while writing. */
  focusMode: boolean
  pageWidth: PageWidth
  /** Keep the caret line vertically centred in the workspace. */
  typewriterMode: boolean
}

export interface ThemeState {
  preference: ThemePreference
  resolved: ResolvedTheme
}

export type LogLevel = 'info' | 'warn' | 'error'
export type NotifyLevel = 'info' | 'success' | 'warning' | 'error'

export interface NotifyPayload {
  level: NotifyLevel
  message: string
  at: number
}

export interface DocumentMeta {
  name: string
  dirty: boolean
}

export interface ElectronApi {
  getInitialDocument: () => Promise<InitialDocument>
  openFile: () => Promise<OpenFileResult>
  openFileAt: (path: string) => Promise<OpenFileResult>
  saveFile: (request: SaveFileRequest) => Promise<SaveFileResult>
  confirmDiscard: () => Promise<DiscardChoice>
  setDocumentMeta: (meta: DocumentMeta) => void
  closeWindow: () => void
  openExternal: (url: string) => Promise<void>
  /** Writes text to the system clipboard. */
  writeClipboard: (text: string) => Promise<void>
  /** Returns the stored theme preference and the currently resolved theme. */
  getTheme: () => Promise<ThemeState>
  /** Persists a theme preference and applies it immediately. */
  setTheme: (preference: ThemePreference) => Promise<ThemeState>
  onThemeChanged: (callback: (state: ThemeState) => void) => () => void
  getViewSettings: () => Promise<ViewSettings>
  setViewSettings: (settings: Partial<ViewSettings>) => Promise<ViewSettings>
  onViewSettingsChanged: (callback: (settings: ViewSettings) => void) => () => void
  /** Opens an OS file picker restricted to image files and returns the chosen path, or null. */
  pickImage: () => Promise<string | null>
  /** Copies a local image into `assets/` next to the document and returns a relative path, or null. */
  importImage: (sourcePath: string) => Promise<string | null>
  /** Writes raw image bytes into `assets/` and returns a relative path, or null. */
  importImageBuffer: (bytes: Uint8Array, mimeType: string) => Promise<string | null>
  onMenuAction: (callback: (action: MenuAction) => void) => () => void
  onSaveAndClose: (callback: () => void) => () => void
  onDocumentReload: (callback: (document: ReloadDocumentPayload) => void) => () => void
  saveAutosave: (request: AutosaveRequest) => Promise<void>
  clearAutosave: () => Promise<void>
  onNotify: (callback: (payload: NotifyPayload) => void) => () => void
  log: (level: LogLevel, message: string, meta?: unknown) => void
  onOpenFile: (callback: (path: string) => void) => () => void
  getPathForFile: (file: File) => string
}
