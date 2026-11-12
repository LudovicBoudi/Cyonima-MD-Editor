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
  | 'shortcuts'
  | 'import'
  | 'export-html'
  | 'export-pdf'
  | 'frontmatter'
  | 'close-tab'
  | 'next-tab'
  | 'prev-tab'
  | 'open-folder'
  | 'history'
  | 'preferences'
  | 'new-window'
  | 'about'

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
  /** Markdown source, or editor HTML when `contentFormat` is `html`. */
  content: string
  /** How to read `content`; absent means Markdown (drafts from older builds). */
  contentFormat?: 'markdown' | 'html'
  /** Frontmatter kept separately when `content` is editor HTML. */
  frontmatter?: string | null
  format: FileFormat
  /** Format to use for documents created from scratch. */
  defaultFormat: FileFormat
  /** True when the content comes from a recovered draft (not yet saved). */
  unsaved?: boolean
  /** Other documents restored with this one, each shown in its own tab. */
  extra?: InitialDocument[]
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

/** One entry of the folder tree: a Markdown file or a folder that contains some. */
export interface WorkspaceNode {
  kind: 'file' | 'folder'
  name: string
  path: string
  children?: WorkspaceNode[]
}

/** The folder opened as a workspace, with its tree of Markdown files. */
export interface WorkspaceState {
  root: string
  name: string
  children: WorkspaceNode[]
  /** True when the tree was cut short because the folder is very large. */
  truncated: boolean
}

/** One stored earlier version of a document. */
export interface HistoryVersion {
  id: string
  /** Time the version was replaced, in milliseconds since the epoch. */
  savedAt: number
  size: number
}

/** Language of the interface, or the operating system language. */
export type Language = 'fr' | 'en'
export type LanguagePreference = 'system' | Language

/** Resolved interface language and the system locale it may follow. */
export interface LocaleState {
  preference: LanguagePreference
  language: Language
  systemLocale: string
}

/** Identity and runtime versions shown in the About screen. */
export interface AppInfo {
  name: string
  version: string
  electron: string
  chromium: string
  node: string
  platform: string
}

/** Preferences shown and edited in the settings screen. */
export interface PreferencesView {
  reopenLastDocument: boolean
  spellCheck: boolean
  spellLanguage: string
  autosaveSeconds: number
  language: LanguagePreference
}

export interface ExportHtmlRequest {
  /** Complete standalone HTML document, ready to write. */
  html: string
  /** Suggested file name, with or without a Markdown extension. */
  fileName: string
  /**
   * Directory of the current document. Used to resolve the remaining relative
   * image paths; `null` falls back to the export folder.
   */
  documentDir: string | null
}

export interface ExportHtmlResult {
  canceled: boolean
  path?: string
  /** Local images that could not be embedded in the exported document. */
  missingImages?: string[]
}

/** Layout choices offered before a PDF export. */
export interface PdfExportOptions {
  /** Prints the document title in the top margin. */
  header: boolean
  /** Prints "Page X sur Y" in the bottom margin. */
  footer: boolean
  /** Inserts a linked table of contents before the document. */
  toc: boolean
  /** Starts every heading of the first level on a new page. */
  pageBreakBeforeH1: boolean
}

export interface ExportPdfRequest {
  /** Complete print-oriented HTML document, ready to render. */
  html: string
  /** Document title printed in the header. */
  title: string
  /** Suggested file name, with or without a Markdown extension. */
  fileName: string
  /** Used by the main process to embed local images before rendering. */
  documentDir: string | null
  options: PdfExportOptions
}

export interface ExportPdfResult {
  canceled: boolean
  path?: string
  missingImages?: string[]
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
  /** Markdown source, or editor HTML when `contentFormat` is `html`. */
  content: string
  /** How to read `content`; absent means Markdown (drafts from older builds). */
  contentFormat?: 'markdown' | 'html'
  /** Frontmatter kept separately when `content` is editor HTML. */
  frontmatter?: string | null
  format: FileFormat
}

/** Recovery copy of one open tab, identified by the tab id. */
export interface AutosaveEntry extends AutosaveRequest {
  id: string
}

export interface AutosaveRecord {
  savedAt: number
  documents: AutosaveEntry[]
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
  /** Target number of words for the status bar progress, or null. */
  wordGoal: number | null
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
  /** Name and path of the active tab. */
  name: string
  path: string | null
  dirty: boolean
  /** Names of every tab with unsaved changes, the active one included. */
  dirtyNames: string[]
}

/** A Markdown file of the library: a document template or an insertable snippet. */
export interface LibraryEntry {
  name: string
  content: string
}

export interface LibraryState {
  templates: LibraryEntry[]
  snippets: LibraryEntry[]
  /** Folder holding the editable library files, shown to the user. */
  folder: string
}

export interface ElectronApi {
  getInitialDocument: () => Promise<InitialDocument>
  /** Lists document templates and snippets, creating the starter files on first use. */
  getLibrary: () => Promise<LibraryState>
  /** Opens the library folder in the system file manager. */
  openLibraryFolder: () => Promise<void>
  openFile: () => Promise<OpenFileResult>
  openFileAt: (path: string) => Promise<OpenFileResult>
  /** Imports a Word document through Pandoc, then opens the converted Markdown. */
  importDocx: () => Promise<OpenFileResult>
  saveFile: (request: SaveFileRequest) => Promise<SaveFileResult>
  /** Asks for a folder and returns its tree, or `null` when cancelled. */
  openFolder: () => Promise<WorkspaceState | null>
  /** The current workspace folder, re-scanned, or `null` when none is open. */
  getWorkspace: () => Promise<WorkspaceState | null>
  closeWorkspace: () => Promise<void>
  getPreferences: () => Promise<PreferencesView>
  /** Applies a partial change and returns the stored preferences. */
  setPreferences: (patch: Partial<PreferencesView>) => Promise<PreferencesView>
  onPreferencesChanged: (callback: (preferences: PreferencesView) => void) => () => void
  /** Current interface language and the system locale it may follow. */
  getLocale: () => Promise<LocaleState>
  onLocaleChanged: (callback: (state: LocaleState) => void) => () => void
  /** Application name, version and runtime versions for the About screen. */
  getAppInfo: () => Promise<AppInfo>
  /** Earlier versions of a document, newest first. */
  listHistory: (path: string) => Promise<HistoryVersion[]>
  readHistory: (path: string, id: string) => Promise<string | null>
  /** Asks for a destination, embeds local images and writes a standalone HTML file. */
  exportHtml: (request: ExportHtmlRequest) => Promise<ExportHtmlResult>
  /** Asks for a destination, renders the print HTML and writes a PDF file. */
  exportPdf: (request: ExportPdfRequest) => Promise<ExportPdfResult>
  confirmDiscard: () => Promise<DiscardChoice>
  setDocumentMeta: (meta: DocumentMeta) => void
  /** Files open in this window, so another window saving one is warned. */
  setOpenPaths: (paths: string[]) => void
  closeWindow: () => void
  openExternal: (url: string) => Promise<void>
  /** Writes text to the system clipboard. */
  writeClipboard: (text: string) => Promise<void>
  /** Reads plain text from the system clipboard. */
  readClipboard: () => Promise<string>
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
  /** Opens a fresh, empty window. */
  newWindow: () => Promise<void>
  /** Replaces this window's recovery copies. An empty list removes them. */
  saveAutosave: (entries: AutosaveEntry[]) => Promise<void>
  clearAutosave: () => Promise<void>
  onNotify: (callback: (payload: NotifyPayload) => void) => () => void
  log: (level: LogLevel, message: string, meta?: unknown) => void
  onOpenFile: (callback: (path: string) => void) => () => void
  getPathForFile: (file: File) => string
}
