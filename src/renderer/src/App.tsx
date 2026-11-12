import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { Minimize2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'
import type {
  AutosaveEntry,
  FileFormat,
  PreferencesView,
  WorkspaceState,
  InitialDocument,
  LibraryEntry,
  LibraryState,
  MenuAction,
  OpenFileResult,
  ThemePreference,
  ViewSettings
} from '../../shared/types'
import { AppHeader } from './components/AppHeader'
import { TabBar } from './components/TabBar'
import { WorkspaceSidebar } from './components/WorkspaceSidebar'
import { HistoryDialog } from './components/HistoryDialog'
import { PreferencesDialog } from './components/PreferencesDialog'
import type { TabSummary } from './components/TabBar'
import { cycleTabId, neighbourAfterClose, snapshotFromDocument } from './lib/tabs'
import type { TabSnapshot } from './lib/tabs'
import { ErrorBoundary } from './components/ErrorBoundary'
import { FindReplaceBar } from './components/FindReplaceBar'
import { FloatingToolbar } from './components/FloatingToolbar'
import { FrontmatterPanel } from './components/FrontmatterPanel'
import { LinkPopover } from './components/LinkPopover'
import { Notifications } from './components/Notifications'
import { StatusBar } from './components/StatusBar'
import type { CursorInfo } from './components/StatusBar'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { LibraryDialog } from './components/LibraryDialog'
import { OutlinePanel } from './components/OutlinePanel'
import { SourceExitDialog, SourceView } from './components/SourceView'
import { Toolbar } from './components/Toolbar'
import { UrlDialog } from './components/UrlDialog'
import type { ImageMeta } from './components/UrlDialog'
import { createExtensions } from './editor/extensions'
import { insertPlainText } from './editor/paste'
import { buildStandaloneHtml, documentTitle } from './editor/htmlExport'
import { buildPrintHtml } from './editor/pdfExport'
import { PdfExportDialog } from './components/PdfExportDialog'
import {
  defaultFrontmatterYaml,
  frontmatterBlock,
  frontmatterBody
} from './editor/frontmatter'
import { readStoredPdfOptions, storePdfOptions } from './lib/pdfOptions'
import { isContentChange } from './editor/documentChanges'
import { findUnrepresentedInlineHtml, inlineHtmlWarning } from './editor/sourceMode'
import { notifyLocal } from './lib/notify'
import {
  htmlToMarkdown,
  joinFrontmatter,
  markdownToHtml,
  resolveLocalImages,
  splitFrontmatter,
  unresolveLocalImages
} from './editor/markdown'
import { caretPositionFrom, countStats } from './lib/documentStats'
import { activeHeadingIndex, readOutline } from './lib/outline'
import type { OutlineItem } from './lib/outline'
import { expandPlaceholders } from '../../shared/templates'
import { buildSearchRegex, findMatchesInSegments } from './lib/search'
import type { SearchMatch, TextSegment } from './lib/search'
import { isMarkdownFileName } from './lib/fileTypes'
import { applyResolvedTheme, readStoredTheme, systemTheme, THEME_STORAGE_KEY } from './lib/theme'
import { readStoredViewSettings, storeViewSettings } from './lib/viewSettings'
import { translate } from '../../shared/i18n'
import { useI18n } from './lib/i18n'
import { loadCommonLanguages } from './editor/highlighting'

type DialogMode =
  | 'link'
  | 'image'
  | 'shortcuts'
  | 'templates'
  | 'snippets'
  | 'pdf'
  | 'history'
  | 'preferences'
  | null

const OUTLINE_STORAGE_KEY = 'cyonima-outline-open'
/** Distance from the top of the workspace at which a heading counts as read. */
const ACTIVE_HEADING_OFFSET = 96

function readStoredOutlineOpen(): boolean {
  try {
    return window.localStorage.getItem(OUTLINE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function storeOutlineOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OUTLINE_STORAGE_KEY, open ? '1' : '0')
  } catch {
    // The panel state is a convenience: losing it is harmless.
  }
}

function normalizeLink(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  if (/^(https?:|mailto:|tel:|#|\/|\.{0,2}\/)/i.test(value)) return value
  return `https://${value}`
}

function normalizeImage(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  if (/^(javascript|vbscript|data:text\/html)/i.test(value)) return ''
  return value
}

/** Returns the directory portion of an absolute file path. */
function dirOf(filePath: string | null): string | null {
  if (!filePath) return null
  const idx = filePath.lastIndexOf('/')
  return idx > 0 ? filePath.slice(0, idx) : null
}

/** Inserts an image node at the current selection, applying an optional width. */
function insertImageNode(
  editor: Editor,
  attrs: { src: string; alt: string; title: string; width: number | null }
): void {
  editor.chain().focus().setImage({ src: attrs.src, alt: attrs.alt, title: attrs.title }).run()
  if (attrs.width) {
    editor.chain().focus().updateAttributes('image', { width: attrs.width }).run()
  }
}

/** Plain text with line breaks between blocks, for counting and caret position. */
const STATS_TEXT_OPTIONS = { blockSeparator: '\n' } as const

function readCursor(editor: Editor): CursorInfo {
  const { from, to, empty } = editor.state.selection
  const doc = editor.state.doc
  return {
    position: caretPositionFrom(doc.textBetween(0, from, '\n')),
    selection: empty ? null : countStats(doc.textBetween(from, to, '\n'))
  }
}

function collectTextSegments(editor: Editor): TextSegment[] {
  const segments: TextSegment[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text) segments.push({ text: node.text, offset: pos })
  })
  return segments
}

function computeMatches(
  editor: Editor,
  term: string,
  options: { caseSensitive: boolean; regex: boolean }
): SearchMatch[] {
  const regex = buildSearchRegex(term, options)
  if (!regex) return []
  return findMatchesInSegments(collectTextSegments(editor), regex)
}

const FIRST_TAB_ID = 'tab-1'

/** The first document is the live editor; restored extras wait in their own tabs. */
function buildInitialTabs(initial: InitialDocument): {
  ids: string[]
  snapshots: Map<string, TabSnapshot>
} {
  const ids = [FIRST_TAB_ID]
  const snapshots = new Map<string, TabSnapshot>()
  for (const document of initial.extra ?? []) {
    const id = `tab-${ids.length + 1}`
    ids.push(id)
    snapshots.set(id, snapshotFromDocument(document, id, true))
  }
  return { ids, snapshots }
}

const UNTITLED_NAMES = new Set(['Sans titre', 'Untitled'])

function Workspace({ initial }: { initial: InitialDocument }) {
  const { t, language, locale } = useI18n()
  const languageRef = useRef(language)
  languageRef.current = language
  const initialIsHtml = initial.contentFormat === 'html'
  const initialParts = useMemo(
    () =>
      initialIsHtml
        ? { frontmatter: initial.frontmatter ?? null, body: initial.content }
        : splitFrontmatter(initial.content),
    [initial.content, initial.frontmatter, initialIsHtml]
  )
  const [documentPath, setDocumentPath] = useState<string | null>(initial.path)
  const [documentName, setDocumentName] = useState(initial.name || t('common.untitled'))
  const displayName = UNTITLED_NAMES.has(documentName) ? t('common.untitled') : documentName
  const localizedName = useCallback(
    (name: string) => (UNTITLED_NAMES.has(name) ? t('common.untitled') : name),
    [t]
  )
  const [frontmatter, setFrontmatter] = useState<string | null>(initialParts.frontmatter)
  /** YAML text being edited in the metadata panel; `null` when not editing. */
  const [frontmatterDraft, setFrontmatterDraft] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null)
  const [preferences, setPreferences] = useState<PreferencesView | null>(null)
  /** Until the stored value arrives, the default interval (7 s) applies. */
  const autosaveSeconds = preferences?.autosaveSeconds ?? 7
  const [format, setFormat] = useState<FileFormat>(initial.format)
  const [dirty, setDirty] = useState(initial.unsaved ?? false)
  const [justSaved, setJustSaved] = useState(false)
  const [stats, setStats] = useState(() => countStats(initialIsHtml ? '' : initialParts.body))
  const [cursor, setCursor] = useState<CursorInfo>({
    position: { line: 1, column: 1 },
    selection: null
  })
  const [dialog, setDialog] = useState<DialogMode>(null)
  const [sourceMode, setSourceMode] = useState(false)
  const [sourceText, setSourceText] = useState('')
  const [sourceOrigin, setSourceOrigin] = useState('')
  const [sourceExit, setSourceExit] = useState<{ tags: string[] } | null>(null)
  const [library, setLibrary] = useState<LibraryState | null>(null)
  const [linkPopover, setLinkPopover] = useState<{
    href: string
    pos: number
    top: number
    left: number
  } | null>(null)
  const [themePreference, setThemePreference] = useState<ThemePreference>(readStoredTheme)
  const themePreferenceRef = useRef(themePreference)
  themePreferenceRef.current = themePreference
  const [viewSettings, setViewSettings] = useState<ViewSettings>(readStoredViewSettings)
  const viewSettingsRef = useRef(viewSettings)
  viewSettingsRef.current = viewSettings
  const workspaceRef = useRef<HTMLElement | null>(null)
  const typographyStyle = useMemo(
    () =>
      ({
        '--doc-font-size': `${viewSettings.fontSize}px`,
        '--doc-line-height': String(viewSettings.lineHeight),
        '--doc-paragraph-spacing': `${viewSettings.paragraphSpacing}em`
      }) as CSSProperties,
    [viewSettings.fontSize, viewSettings.lineHeight, viewSettings.paragraphSpacing]
  )
  const savingRef = useRef(false)
  const statsTimerRef = useRef<number | null>(null)
  const [outlineOpen, setOutlineOpen] = useState(readStoredOutlineOpen)
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [activeHeading, setActiveHeading] = useState<number | null>(null)
  const outlineTimerRef = useRef<number | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const documentPathRef = useRef<string | null>(documentPath)
  documentPathRef.current = documentPath

  const [findOpen, setFindOpen] = useState(false)
  const [findTerm, setFindTerm] = useState('')
  const [findCase, setFindCase] = useState(false)
  const [findRegex, setFindRegex] = useState(false)
  const [replaceTerm, setReplaceTerm] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [currentMatch, setCurrentMatch] = useState(0)

  const searchConfigRef = useRef({ open: false, term: '', caseSensitive: false, regex: false })
  searchConfigRef.current = {
    open: findOpen,
    term: findTerm,
    caseSensitive: findCase,
    regex: findRegex
  }

  const liveDocument = {
    dirty,
    documentPath,
    documentName,
    frontmatter,
    frontmatterDraft,
    format,
    sourceMode,
    sourceText,
    sourceOrigin
  }
  const autosaveRef = useRef(liveDocument)
  autosaveRef.current = liveDocument

  const [initialTabs] = useState(() => buildInitialTabs(initial))
  const tabsRef = useRef(initialTabs.snapshots)
  const tabCounterRef = useRef(initialTabs.ids.length)
  const [tabIds, setTabIds] = useState(initialTabs.ids)
  const [activeTabId, setActiveTabId] = useState(FIRST_TAB_ID)
  const tabIdsRef = useRef(tabIds)
  tabIdsRef.current = tabIds
  const activeTabIdRef = useRef(activeTabId)
  activeTabIdRef.current = activeTabId

  const extensions = useMemo(
    () =>
      createExtensions({
        getDocumentDir: () => (documentPathRef.current ? dirOf(documentPathRef.current) : null),
        getPlaceholder: () => translate(languageRef.current, 'editor.placeholder')
      }),
    []
  )

  const initialContent = useMemo(() => {
    // Autosaved drafts keep editor HTML so a crash recovery does not require a
    // slow Markdown serialization while the user is typing.
    if (initialIsHtml) return initialParts.body
    const html = markdownToHtml(initialParts.body)
    const dir = dirOf(initial.path)
    return dir ? resolveLocalImages(html, dir) : html
  }, [initialParts.body, initial.path, initialIsHtml])

  const editor = useEditor({
    extensions,
    content: initialContent,
    autofocus: 'start',
    editorProps: {
      attributes: {
        class: 'md-editor',
        spellcheck: 'true',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': translate(languageRef.current, 'app.editorAria')
      },
      handleClick: (view, pos, event) => {
        const anchor = (event.target as HTMLElement | null)?.closest('a')
        if (!anchor) return false

        event.preventDefault()
        const href = anchor.getAttribute('href') ?? ''

        if (event.metaKey || event.ctrlKey) {
          void window.api.openExternal(href)
          return true
        }

        // Plain click: show the link action popover.
        const rect = anchor.getBoundingClientRect()
        setLinkPopover({
          href,
          pos,
          top: Math.min(rect.bottom + 6, window.innerHeight - 90),
          left: Math.max(8, Math.min(rect.left, window.innerWidth - 320))
        })
        return true
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items
        if (!items) return false
        const imageItem = Array.from(items).find((item) => item.type.startsWith('image/'))
        if (!imageItem) return false
        const file = imageItem.getAsFile()
        if (!file) return false

        // Save the screenshot to assets/ next to the document, then insert.
        void (async () => {
          const dir = documentPathRef.current ? dirOf(documentPathRef.current) : null
          const current = editorRef.current
          if (!dir || !current) return
          const bytes = new Uint8Array(await file.arrayBuffer())
          const relative = await window.api.importImageBuffer(bytes, file.type)
          if (!relative) return
          insertImageNode(current, {
            src: `local-file://${dir}/${relative}`,
            alt: '',
            title: '',
            width: null
          })
        })()

        return true
      }
    },
    onCreate: ({ editor: current }) => {
      setStats(countStats(current.getText(STATS_TEXT_OPTIONS)))
      setCursor(readCursor(current))
    },
    onSelectionUpdate: ({ editor: current }) => {
      setCursor(readCursor(current))
    },
    onUpdate: ({ editor: current, transaction, appendedTransactions }) => {
      if (!isContentChange(transaction, appendedTransactions)) return
      setDirty(true)
      setLinkPopover(null)
      // Debounce the word/character count: recomputing it on every keystroke
      // walks the whole document, which is wasteful on large files.
      if (statsTimerRef.current) window.clearTimeout(statsTimerRef.current)
      statsTimerRef.current = window.setTimeout(() => {
        setStats(countStats(current.getText(STATS_TEXT_OPTIONS)))
      }, 300)

      // Keep search results in sync while the document is edited.
      const config = searchConfigRef.current
      if (config.open && config.term) {
        const found = computeMatches(current, config.term, config)
        setMatches(found)
        setCurrentMatch(found.length ? 0 : 0)
        if (found.length) current.commands.setSearchHighlight(found, 0)
        else current.commands.clearSearchHighlight()
      }
    },
    onDestroy: () => {
      if (statsTimerRef.current) window.clearTimeout(statsTimerRef.current)
    }
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // Marks used by the performance benchmark (and the DevTools timeline).
  useEffect(() => {
    if (!editor) return
    performance.mark('cyonima:editor-ready')
    try {
      performance.measure('cyonima:editor-boot', 'cyonima:renderer-boot', 'cyonima:editor-ready')
    } catch {
      // A missing start mark must never break the editor.
    }
  }, [editor])

  // The editor attributes are set at creation: translate them in place when
  // the interface language changes instead of rebuilding the editor.
  useEffect(() => {
    editor?.view.dom.setAttribute('aria-label', t('app.editorAria'))
  }, [editor, t])

  // The common syntax grammars are a large chunk. Load them when the editor is
  // idle, then rebuild the code-block decorations once, without marking the
  // document dirty or adding an undo step.
  useEffect(() => {
    if (!editor) return
    let cancelled = false

    const hasCodeBlock = () => {
      let found = false
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'codeBlock') {
          found = true
          return false
        }
        return true
      })
      return found
    }

    const refresh = () => {
      if (cancelled || editor.isDestroyed || !hasCodeBlock()) return
      const { state, view } = editor
      const { from, to } = state.selection
      const transaction = state.tr
        .replaceWith(0, state.doc.content.size, state.doc.content)
        .setMeta('preventUpdate', true)
        .setMeta('addToHistory', false)
      view.dispatch(transaction)
      editor.commands.setTextSelection({ from, to })
    }

    const start = () => {
      void loadCommonLanguages()
        .then(refresh)
        .catch(() => undefined)
    }

    const idle = typeof window.requestIdleCallback === 'function'
    const handle = idle ? window.requestIdleCallback(start, { timeout: 2000 }) : window.setTimeout(start, 1200)

    return () => {
      cancelled = true
      if (idle) window.cancelIdleCallback?.(handle)
      else window.clearTimeout(handle)
    }
  }, [editor])

  // ---- Affichage -------------------------------------------------------

  const adoptViewSettings = useCallback((next: ViewSettings) => {
    setViewSettings(next)
    storeViewSettings(next)
  }, [])

  useEffect(() => {
    let active = true

    void window.api.getViewSettings().then((next) => {
      if (active) adoptViewSettings(next)
    })

    const unsubscribe = window.api.onViewSettingsChanged(adoptViewSettings)

    return () => {
      active = false
      unsubscribe()
    }
  }, [adoptViewSettings])

  const changeViewSettings = useCallback(
    async (patch: Partial<ViewSettings>) => {
      setViewSettings((current) => ({ ...current, ...patch }))
      const next = await window.api.setViewSettings(patch)
      adoptViewSettings(next)
    },
    [adoptViewSettings]
  )

  // Keep the caret line vertically centred in the workspace.
  useEffect(() => {
    if (!editor || !viewSettings.typewriterMode) return

    let frame = 0
    const centreCaret = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const workspace = workspaceRef.current
        if (!workspace || !editor.isFocused) return
        const coords = editor.view.coordsAtPos(editor.state.selection.head)
        const rect = workspace.getBoundingClientRect()
        const offset = coords.top - rect.top
        const target = workspace.scrollTop + offset - rect.height / 2
        if (Math.abs(target - workspace.scrollTop) < 2) return
        workspace.scrollTo({ top: Math.max(0, target), behavior: 'auto' })
      })
    }

    centreCaret()
    editor.on('selectionUpdate', centreCaret)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      editor.off('selectionUpdate', centreCaret)
    }
  }, [editor, viewSettings.typewriterMode])

  // ---- Thème -----------------------------------------------------------

  useEffect(() => {
    let active = true

    const applyState = (state: { preference: ThemePreference; resolved: 'light' | 'dark' }) => {
      setThemePreference(state.preference)
      applyResolvedTheme(state.resolved)
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, state.preference)
      } catch {
        // The Electron settings file remains the source of truth.
      }
    }

    void window.api.getTheme().then((state) => {
      if (active) applyState(state)
    })

    const unsubscribe = window.api.onThemeChanged(applyState)
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemChange = () => {
      if (themePreferenceRef.current === 'system') applyResolvedTheme(systemTheme())
    }
    query.addEventListener('change', onSystemChange)

    return () => {
      active = false
      unsubscribe()
      query.removeEventListener('change', onSystemChange)
    }
  }, [])

  const changeTheme = useCallback(async (preference: ThemePreference) => {
    setThemePreference(preference)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference)
    } catch {
      // The Electron settings file remains the source of truth.
    }
    const state = await window.api.setTheme(preference)
    setThemePreference(state.preference)
    applyResolvedTheme(state.resolved)
  }, [])

  const getMarkdown = useCallback(() => {
    if (!editor) return ''
    const html = unresolveLocalImages(editor.getHTML(), dirOf(documentPathRef.current))
    return htmlToMarkdown(html)
  }, [editor])

  /** Recovery copies of the dirty tabs, by tab id; the file always holds the whole list. */
  const autosaveEntriesRef = useRef(new Map<string, AutosaveEntry>())
  const writeAutosaveEntries = useCallback(() => {
    void window.api.saveAutosave(Array.from(autosaveEntriesRef.current.values()))
  }, [])
  const forgetAutosave = useCallback(
    (id: string) => {
      autosaveEntriesRef.current.delete(id)
      writeAutosaveEntries()
    },
    [writeAutosaveEntries]
  )

  const refreshWorkspace = useCallback(async () => {
    setWorkspace(await window.api.getWorkspace())
  }, [])

  const openFolder = useCallback(async () => {
    const state = await window.api.openFolder()
    if (state) setWorkspace(state)
  }, [])

  const openHistory = useCallback(() => {
    if (!autosaveRef.current.documentPath) {
      notifyLocal('info', t('app.historyNeedsSave'))
      return
    }
    setDialog('history')
  }, [t])

  const closeFolder = useCallback(async () => {
    await window.api.closeWorkspace()
    setWorkspace(null)
  }, [])

  useEffect(() => {
    void refreshWorkspace()
  }, [refreshWorkspace])

  useEffect(() => {
    let active = true
    void window.api.getPreferences().then((value) => {
      if (active) setPreferences(value)
    })
    const unsubscribe = window.api.onPreferencesChanged((value) => setPreferences(value))
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const updatePreferences = useCallback(async (patch: Partial<PreferencesView>) => {
    setPreferences(await window.api.setPreferences(patch))
  }, [])

  const save = useCallback(
    async (saveAs = false): Promise<boolean> => {
      if (!editor || savingRef.current) return false
      savingRef.current = true

      try {
        const result = await window.api.saveFile({
          content: sourceMode ? sourceText : joinFrontmatter(frontmatter, getMarkdown()),
          path: documentPath,
          saveAs,
          format
        })
        if (result.canceled || !result.path) return false

        setDocumentPath(result.path)
        setDocumentName(result.name ?? documentName)
        setDirty(false)
        setJustSaved(true)
        forgetAutosave(activeTabIdRef.current)
        void refreshWorkspace()
        return true
      } finally {
        savingRef.current = false
      }
    },
    [editor, getMarkdown, documentPath, documentName, frontmatter, format, sourceMode, sourceText, forgetAutosave, refreshWorkspace]
  )
  // Tab helpers run from event callbacks; they read the latest save through this ref.
  const saveRef = useRef(save)
  saveRef.current = save

  const exportHtml = useCallback(async () => {
    const markdown = sourceMode ? sourceText : joinFrontmatter(frontmatter, getMarkdown())
    const documentDir = dirOf(documentPath)
    const html = buildStandaloneHtml({
      markdown,
      fileName: displayName,
      typography: viewSettingsRef.current,
      documentDir,
      language
    })

    await window.api.exportHtml({ html, fileName: displayName, documentDir })
  }, [sourceMode, sourceText, frontmatter, getMarkdown, displayName, documentPath, language])

  const [pdfOptions, setPdfOptions] = useState(readStoredPdfOptions)

  const exportPdf = useCallback(async () => {
    const markdown = sourceMode ? sourceText : joinFrontmatter(frontmatter, getMarkdown())
    const documentDir = dirOf(documentPath)
    storePdfOptions(pdfOptions)
    setDialog(null)
    const html = buildPrintHtml({
      markdown,
      fileName: displayName,
      typography: viewSettingsRef.current,
      documentDir,
      options: pdfOptions,
      language
    })
    const title = documentTitle(markdown, displayName)
    await window.api.exportPdf({
      html,
      title,
      fileName: displayName,
      documentDir,
      options: pdfOptions
    })
  }, [sourceMode, sourceText, frontmatter, getMarkdown, displayName, documentPath, pdfOptions, language])

  // ---- Rechercher / remplacer -----------------------------------------

  const applySearchState = useCallback(
    (found: SearchMatch[], activeIndex: number) => {
      setMatches(found)
      setCurrentMatch(activeIndex)
      if (!editor) return
      if (found.length > 0) editor.commands.setSearchHighlight(found, activeIndex)
      else editor.commands.clearSearchHighlight()
    },
    [editor]
  )

  const openFind = useCallback(() => {
    if (!editor) return
    setFindOpen(true)
  }, [editor])

  const closeFind = useCallback(() => {
    setFindOpen(false)
    editor?.commands.clearSearchHighlight()
    editor?.commands.focus()
  }, [editor])

  const enterSource = useCallback(() => {
    if (!editor) return
    const markdown = joinFrontmatter(frontmatter, getMarkdown())
    setSourceText(markdown)
    setSourceOrigin(markdown)
    setSourceMode(true)
    setFrontmatterDraft(null)
    setLinkPopover(null)
    if (findOpen) closeFind()
  }, [editor, frontmatter, getMarkdown, findOpen, closeFind])

  // The source text is only read back into the editor when it was edited, so
  // leaving the source view without changes never rewrites the document.
  const leaveSource = useCallback(
    (accept = false) => {
      if (!editor) return
      if (sourceText === sourceOrigin) {
        setSourceMode(false)
        return
      }

      if (!accept) {
        const tags = findUnrepresentedInlineHtml(sourceText)
        if (tags.length > 0) {
          setSourceExit({ tags })
          return
        }
      }

      const parts = splitFrontmatter(sourceText)
      const documentDir = dirOf(documentPath)
      let html = markdownToHtml(parts.body)
      if (documentDir) html = resolveLocalImages(html, documentDir)
      editor.commands.setContent(html, { emitUpdate: false })
      setFrontmatter(parts.frontmatter)
      setFrontmatterDraft(null)
      setStats(countStats(editor.getText(STATS_TEXT_OPTIONS)))
      setCursor(readCursor(editor))
      setSourceExit(null)
      setSourceMode(false)
      editor.commands.focus('start')
    },
    [editor, sourceText, sourceOrigin, documentPath]
  )

  const toggleSource = useCallback(() => {
    if (sourceMode) leaveSource()
    else enterSource()
  }, [sourceMode, leaveSource, enterSource])

  const openFrontmatterEditor = useCallback(() => {
    // In source mode the YAML is edited directly in the raw text.
    if (sourceMode || frontmatterDraft !== null) return
    setFrontmatterDraft(
      frontmatter !== null
        ? frontmatterBody(frontmatter)
        : defaultFrontmatterYaml(displayName, language)
    )
  }, [sourceMode, frontmatter, frontmatterDraft, displayName, language])

  const saveFrontmatter = useCallback(
    (yaml: string) => {
      setFrontmatterDraft(null)
      if (frontmatter !== null && yaml === frontmatterBody(frontmatter)) return
      const block = frontmatterBlock(yaml)
      if (block === frontmatter) return
      setFrontmatter(block)
      setDirty(true)
    },
    [frontmatter]
  )

  const deleteFrontmatter = useCallback(() => {
    setFrontmatterDraft(null)
    if (frontmatter === null) return
    setFrontmatter(null)
    setDirty(true)
  }, [frontmatter])

  // ---- Onglets ---------------------------------------------------------

  const nextTabId = useCallback(() => {
    tabCounterRef.current += 1
    return `tab-${tabCounterRef.current}`
  }, [])

  const captureActive = useCallback(
    (id: string): TabSnapshot => {
      const live = autosaveRef.current
      return {
        id,
        path: live.documentPath,
        name: live.documentName,
        format: live.format,
        frontmatter: live.frontmatter,
        frontmatterDraft: live.frontmatterDraft,
        dirty: live.dirty,
        markdown: live.sourceMode ? live.sourceText : '',
        html: !live.sourceMode && editor ? editor.getHTML() : null,
        json: editor ? editor.getJSON() : null,
        sourceMode: live.sourceMode,
        sourceText: live.sourceText,
        sourceOrigin: live.sourceOrigin,
        scrollTop: workspaceRef.current?.scrollTop ?? 0
      }
    },
    [editor]
  )

  const applyTab = useCallback(
    (snapshot: TabSnapshot) => {
      if (!editor) return
      if (snapshot.json) {
        editor.commands.setContent(snapshot.json, { emitUpdate: false })
      } else if (snapshot.html !== null) {
        // Autosaved drafts already hold editor HTML (local image URLs included).
        editor.commands.setContent(snapshot.html, { emitUpdate: false })
      } else {
        const documentDir = dirOf(snapshot.path)
        let html = markdownToHtml(splitFrontmatter(snapshot.markdown).body)
        if (documentDir) html = resolveLocalImages(html, documentDir)
        editor.commands.setContent(html, { emitUpdate: false })
      }
      setDocumentPath(snapshot.path)
      setDocumentName(snapshot.name)
      setFrontmatter(snapshot.frontmatter)
      setFrontmatterDraft(snapshot.frontmatterDraft)
      setFormat(snapshot.format)
      setDirty(snapshot.dirty)
      setSourceMode(snapshot.sourceMode)
      setSourceText(snapshot.sourceText)
      setSourceOrigin(snapshot.sourceOrigin)
      setSourceExit(null)
      setJustSaved(false)
      setLinkPopover(null)
      setStats(countStats(editor.getText(STATS_TEXT_OPTIONS)))
      setCursor(readCursor(editor))
      window.requestAnimationFrame(() => {
        if (workspaceRef.current) workspaceRef.current.scrollTop = snapshot.scrollTop
      })
    },
    [editor]
  )

  // flushSync makes the switch complete before the caller continues, so a
  // save that follows always acts on the tab that was just shown.
  const switchTab = useCallback(
    (id: string) => {
      const current = activeTabIdRef.current
      const target = tabsRef.current.get(id)
      if (!editor || id === current || !target) return
      closeFind()
      tabsRef.current.set(current, captureActive(current))
      tabsRef.current.delete(id)
      flushSync(() => {
        setActiveTabId(id)
        applyTab(target)
      })
      editor.commands.focus()
    },
    [editor, closeFind, captureActive, applyTab]
  )

  const tabIdForPath = useCallback((path: string): string | null => {
    if (autosaveRef.current.documentPath === path) return activeTabIdRef.current
    for (const [id, tab] of tabsRef.current) {
      if (tab.path === path) return id
    }
    return null
  }, [])

  /**
   * Shows a new document in a tab. A pristine untitled tab is replaced instead,
   * so opening a file from an empty start does not leave an empty tab behind.
   */
  const openInTab = useCallback(
    (snapshot: TabSnapshot) => {
      if (!editor) return
      const current = activeTabIdRef.current
      const live = autosaveRef.current
      const replaceCurrent =
        !live.dirty && !live.documentPath && live.frontmatter === null && editor.isEmpty
      if (!replaceCurrent) tabsRef.current.set(current, captureActive(current))

      flushSync(() => {
        setTabIds((ids) =>
          replaceCurrent
            ? ids.map((id) => (id === current ? snapshot.id : id))
            : [...ids, snapshot.id]
        )
        setActiveTabId(snapshot.id)
        applyTab(snapshot)
      })
      editor.commands.focus('start')
    },
    [editor, captureActive, applyTab]
  )

  const newDocument = useCallback(
    (body = '') => {
      if (!editor) return
      openInTab(
        snapshotFromDocument(
          { path: null, name: t('common.untitled'), content: body, format: initial.defaultFormat },
          nextTabId(),
          body.length > 0
        )
      )
    },
    [editor, openInTab, nextTabId, initial.defaultFormat, t]
  )

  const applyOpenedDocument = useCallback(
    (result: OpenFileResult) => {
      if (!editor || result.canceled || result.content == null) return

      const existing = result.path ? tabIdForPath(result.path) : null
      if (existing) {
        switchTab(existing)
        return
      }
      openInTab(
        snapshotFromDocument(
          {
            path: result.path ?? null,
            name: result.name ?? t('common.untitled'),
            content: result.content,
            format: result.format ?? initial.defaultFormat
          },
          nextTabId()
        )
      )
    },
    [editor, tabIdForPath, switchTab, openInTab, nextTabId, initial.defaultFormat, t]
  )

  const openDocument = useCallback(async () => {
    if (!editor) return
    applyOpenedDocument(await window.api.openFile())
  }, [editor, applyOpenedDocument])

  const openDocumentAt = useCallback(
    async (path: string) => {
      if (!editor) return
      applyOpenedDocument(await window.api.openFileAt(path))
    },
    [editor, applyOpenedDocument]
  )

  const importDocument = useCallback(async () => {
    if (!editor) return
    applyOpenedDocument(await window.api.importDocx())
  }, [editor, applyOpenedDocument])

  const closeTab = useCallback(
    async (id: string) => {
      if (!editor) return
      if (id !== activeTabIdRef.current) switchTab(id)

      if (autosaveRef.current.dirty) {
        const choice = await window.api.confirmDiscard()
        if (choice === 'cancel') return
        if (choice === 'save' && !(await saveRef.current())) return
      }

      const nextId = neighbourAfterClose(tabIdsRef.current, id)
      forgetAutosave(id)

      if (nextId === null) {
        const blank = snapshotFromDocument(
          { path: null, name: t('common.untitled'), content: '', format: initial.defaultFormat },
          nextTabId()
        )
        flushSync(() => {
          setTabIds([blank.id])
          setActiveTabId(blank.id)
          applyTab(blank)
        })
        return
      }

      const next = tabsRef.current.get(nextId)
      if (!next) return
      tabsRef.current.delete(nextId)
      flushSync(() => {
        setTabIds(tabIdsRef.current.filter((tabId) => tabId !== id))
        setActiveTabId(nextId)
        applyTab(next)
      })
    },
    [editor, switchTab, forgetAutosave, applyTab, nextTabId, initial.defaultFormat, t]
  )

  const cycleTab = useCallback(
    (step: number) => {
      const target = cycleTabId(tabIdsRef.current, activeTabIdRef.current, step)
      if (target) switchTab(target)
    },
    [switchTab]
  )

  /** Saves every tab with unsaved changes, one after the other, then closes the window. */
  const saveAllAndClose = useCallback(async () => {
    for (const id of [...tabIdsRef.current]) {
      const tab = id === activeTabIdRef.current ? autosaveRef.current : tabsRef.current.get(id)
      if (!tab?.dirty) continue
      switchTab(id)
      if (!(await saveRef.current())) return
    }
    window.api.closeWindow()
  }, [switchTab])

  const tabSummaries: TabSummary[] = tabIds.map((id) => {
    if (id === activeTabId) return { id, name: displayName, dirty, path: documentPath }
    const tab = tabsRef.current.get(id)
    return {
      id,
      name: localizedName(tab?.name ?? t('common.untitled')),
      dirty: tab?.dirty ?? false,
      path: tab?.path ?? null
    }
  })

  const restoreVersion = useCallback(
    (content: string) => {
      const live = autosaveRef.current
      if (!live.documentPath) return
      setDialog(null)
      openInTab(
        snapshotFromDocument(
          { path: live.documentPath, name: live.documentName, content, format: live.format },
          nextTabId(),
          true
        )
      )
    },
    [openInTab, nextTabId]
  )

  const openLibrary = useCallback(async (mode: 'templates' | 'snippets') => {
    setLibrary(await window.api.getLibrary())
    setDialog(mode)
  }, [])

  const createFromTemplate = useCallback(
    (entry: LibraryEntry) => {
      setDialog(null)
      void newDocument(expandPlaceholders(entry.content, undefined, locale))
    },
    [newDocument, locale]
  )

  const insertSnippet = useCallback(
    (entry: LibraryEntry) => {
      if (!editor) return
      setDialog(null)
      editor.chain().focus().run()
      // Pasting goes through the clean-paste handler, so Markdown in a snippet
      // becomes structure, as it does for any pasted Markdown.
      insertPlainText(editor, expandPlaceholders(entry.content, undefined, locale), () => null)
    },
    [editor, locale]
  )

  const onSourceChange = useCallback((value: string) => {
    setSourceText(value)
    setDirty(true)
  }, [])

  // The first document is announced once the notification list has mounted,
  // which happens after this component's effects run.
  useEffect(() => {
    if (initialIsHtml) return
    const lossy = inlineHtmlWarning(initialParts.body, language)
    if (!lossy) return
    const timer = window.setTimeout(() => notifyLocal('warning', lossy), 0)
    return () => window.clearTimeout(timer)
  }, [initialParts.body, language, initialIsHtml])

  // Setting a whole document does not emit an update, but it always dispatches
  // a transaction, so the outline listens to transactions.
  useEffect(() => {
    if (!editor) return

    const refresh = () => {
      if (outlineTimerRef.current) window.clearTimeout(outlineTimerRef.current)
      outlineTimerRef.current = window.setTimeout(() => setOutline(readOutline(editor, language)), 150)
    }
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) refresh()
    }

    refresh()
    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
      if (outlineTimerRef.current) window.clearTimeout(outlineTimerRef.current)
    }
  }, [editor, language])

  const updateActiveHeading = useCallback(() => {
    const workspace = workspaceRef.current
    if (!editor || !workspace) return
    // A short last section may never reach the reading line: at the end of
    // the document, the last heading is the one being read.
    const atEnd = workspace.scrollTop + workspace.clientHeight >= workspace.scrollHeight - 4
    if (atEnd && outline.length > 0) {
      setActiveHeading(outline.length - 1)
      return
    }
    const readingLine = workspace.getBoundingClientRect().top + ACTIVE_HEADING_OFFSET
    const tops = outline.map((item) => {
      const element = editor.view.nodeDOM(item.pos)
      return element instanceof HTMLElement ? element.getBoundingClientRect().top : Infinity
    })
    setActiveHeading(activeHeadingIndex(tops, readingLine))
  }, [editor, outline])

  useEffect(() => {
    const workspace = workspaceRef.current
    if (!outlineOpen || !workspace) return

    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateActiveHeading)
    }
    updateActiveHeading()
    workspace.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      workspace.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [outlineOpen, updateActiveHeading])

  const toggleOutline = useCallback(() => {
    const next = !outlineOpen
    setOutlineOpen(next)
    storeOutlineOpen(next)
  }, [outlineOpen])

  const goToHeading = useCallback(
    (pos: number) => {
      if (!editor) return
      editor.commands.setTextSelection(pos + 1)
      editor.view.focus()
      if (!viewSettingsRef.current.typewriterMode) {
        const element = editor.view.nodeDOM(pos)
        if (element instanceof HTMLElement) element.scrollIntoView({ block: 'start', behavior: 'smooth' })
      }
    },
    [editor]
  )

  const goToMatch = useCallback(
    (index: number) => {
      if (!editor || matches.length === 0) return
      const next = ((index % matches.length) + matches.length) % matches.length
      const match = matches[next]

      setCurrentMatch(next)
      editor.commands.setSearchHighlight(matches, next)
      editor
        .chain()
        .focus()
        .setTextSelection({ from: match.from, to: match.to })
        .scrollIntoView()
        .run()
    },
    [editor, matches]
  )

  const goToNext = useCallback(() => goToMatch(currentMatch + 1), [goToMatch, currentMatch])
  const goToPrev = useCallback(() => goToMatch(currentMatch - 1), [goToMatch, currentMatch])

  const replaceCurrent = useCallback(() => {
    if (!editor || matches.length === 0 || currentMatch >= matches.length) return
    const match = matches[currentMatch]

    editor.view.dispatch(
      editor.state.tr.replaceWith(match.from, match.to, editor.state.schema.text(replaceTerm))
    )

    const found = computeMatches(editor, findTerm, { caseSensitive: findCase, regex: findRegex })
    applySearchState(found, Math.min(currentMatch, Math.max(0, found.length - 1)))
  }, [editor, matches, currentMatch, replaceTerm, findTerm, findCase, findRegex, applySearchState])

  const replaceAll = useCallback(() => {
    if (!editor || matches.length === 0) return

    const sorted = [...matches].sort((a, b) => b.from - a.from)
    const tr = editor.state.tr
    for (const match of sorted) {
      tr.replaceWith(match.from, match.to, editor.state.schema.text(replaceTerm))
    }
    editor.view.dispatch(tr)

    const found = computeMatches(editor, findTerm, { caseSensitive: findCase, regex: findRegex })
    applySearchState(found, 0)
  }, [editor, matches, replaceTerm, findTerm, findCase, findRegex, applySearchState])

  useEffect(() => {
    if (!editor || !findOpen) return
    const found = computeMatches(editor, findTerm, { caseSensitive: findCase, regex: findRegex })
    applySearchState(found, 0)
  }, [editor, findOpen, findTerm, findCase, findRegex, applySearchState])

  const applyLink = useCallback(
    (raw: string) => {
      if (!editor) return
      if (/^(javascript|vbscript|data):/i.test(raw.trim())) return
      const href = normalizeLink(raw)
      if (!href) {
        editor.chain().focus().extendMarkRange('link').unsetLink().run()
        setDialog(null)
        return
      }

      if (editor.state.selection.empty) {
        editor
          .chain()
          .focus()
          .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
          .run()
      } else {
        editor
          .chain()
          .focus()
          .extendMarkRange('link')
          .setLink({ href })
          // Changing the target of a reference link turns it into an inline
          // link: keeping the identifier would silently write the old
          // definition back over the new URL.
          .updateAttributes('link', { referenceId: null, referenceStyle: null })
          .run()
      }
      setDialog(null)
    },
    [editor]
  )

  const applyImage = useCallback(
    async (raw: string, meta?: ImageMeta) => {
      if (!editor) return
      const src = normalizeImage(raw)
      if (!src) return

      let finalSrc: string
      if (
        src.startsWith('http://') ||
        src.startsWith('https://') ||
        src.startsWith('data:') ||
        src.startsWith('local-file://')
      ) {
        finalSrc = src
      } else if (src.startsWith('/')) {
        // Absolute local path (from the picker): copy into assets/ next to the
        // document so the saved Markdown uses a portable relative path.
        const dir = dirOf(documentPath)
        if (dir) {
          const relative = await window.api.importImage(src)
          finalSrc = relative ? `local-file://${dir}/${relative}` : `local-file://${src}`
        } else {
          finalSrc = `local-file://${src}`
        }
      } else {
        // Relative path typed by hand: resolve for display, no copy.
        const dir = dirOf(documentPath)
        finalSrc = dir ? `local-file://${dir}/${src.replace(/^\.\//, '')}` : src
      }

      insertImageNode(editor, {
        src: finalSrc,
        alt: meta?.alt ?? '',
        title: meta?.title ?? '',
        width: meta?.width ?? null
      })
      setDialog(null)
    },
    [editor, documentPath]
  )

  const removeLink = useCallback(() => {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run()
    setDialog(null)
  }, [editor])

  const openLinkFromPopover = useCallback(() => {
    if (!linkPopover) return
    const { href } = linkPopover

    if (href.startsWith('#')) {
      const id = href.slice(1)
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (/^(https?:|mailto:)/i.test(href)) {
      void window.api.openExternal(href)
    }
    setLinkPopover(null)
  }, [linkPopover])

  const editLinkFromPopover = useCallback(() => {
    if (!editor || !linkPopover) return
    // Select the clicked link so the dialog reads its current href.
    editor.chain().focus().setTextSelection(linkPopover.pos).extendMarkRange('link').run()
    setLinkPopover(null)
    setDialog('link')
  }, [editor, linkPopover])

  const copyLinkFromPopover = useCallback(() => {
    if (!linkPopover) return
    void window.api.writeClipboard(linkPopover.href)
    setLinkPopover(null)
  }, [linkPopover])

  const removeLinkFromPopover = useCallback(() => {
    if (!editor || !linkPopover) return
    editor
      .chain()
      .focus()
      .setTextSelection(linkPopover.pos)
      .extendMarkRange('link')
      .unsetLink()
      .run()
    setLinkPopover(null)
  }, [editor, linkPopover])

  // Dismiss the link popover when clicking anywhere outside it.
  useEffect(() => {
    if (!linkPopover) return
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('.link-popover')) setLinkPopover(null)
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [linkPopover])

  // Notify the main process so the window title and close guard stay in sync.
  useEffect(() => {
    const dirtyNames = tabIds.flatMap((id) => {
      if (id === activeTabId) return dirty ? [displayName] : []
      const tab = tabsRef.current.get(id)
      return tab?.dirty ? [localizedName(tab.name)] : []
    })
    window.api.setDocumentMeta({ name: displayName, path: documentPath, dirty, dirtyNames })
  }, [displayName, dirty, documentPath, tabIds, activeTabId, localizedName])

  // Files this window holds, including inactive tabs. Another window saving one
  // of them is warned before overwriting.
  useEffect(() => {
    const paths = tabIds.flatMap((id) => {
      if (id === activeTabId) return documentPath ? [documentPath] : []
      const path = tabsRef.current.get(id)?.path
      return path ? [path] : []
    })
    window.api.setOpenPaths(paths)
  }, [documentPath, tabIds, activeTabId])

  useEffect(() => {
    if (!justSaved) return
    const timer = window.setTimeout(() => setJustSaved(false), 2400)
    return () => window.clearTimeout(timer)
  }, [justSaved])

  useEffect(() => {
    document.title = `${dirty ? '• ' : ''}${displayName} — Cyonima MD Editor`
  }, [displayName, dirty])

  // Menu commands arriving from the Electron main process.
  useEffect(() => {
    if (!editor) return

    const runAction = (action: MenuAction) => {
      switch (action) {
        case 'new':
          void newDocument()
          break
        case 'open':
          void openDocument()
          break
        case 'import':
          void importDocument()
          break
        case 'export-html':
          void exportHtml()
          break
        case 'export-pdf':
          setDialog('pdf')
          break
        case 'frontmatter':
          openFrontmatterEditor()
          break
        case 'close-tab':
          void closeTab(activeTabIdRef.current)
          break
        case 'next-tab':
          cycleTab(1)
          break
        case 'prev-tab':
          cycleTab(-1)
          break
        case 'open-folder':
          void openFolder()
          break
        case 'history':
          openHistory()
          break
        case 'preferences':
          setDialog('preferences')
          break
        case 'new-window':
          void window.api.newWindow()
          break
        case 'save':
          void save()
          break
        case 'save-as':
          void save(true)
          break
        case 'undo':
          editor.chain().focus().undo().run()
          break
        case 'redo':
          editor.chain().focus().redo().run()
          break
        case 'bold':
          editor.chain().focus().toggleBold().run()
          break
        case 'italic':
          editor.chain().focus().toggleItalic().run()
          break
        case 'underline':
          editor.chain().focus().toggleUnderline().run()
          break
        case 'strike':
          editor.chain().focus().toggleStrike().run()
          break
        case 'code':
          editor.chain().focus().toggleCode().run()
          break
        case 'link':
          setDialog('link')
          break
        case 'find':
          openFind()
          break
        case 'shortcuts':
          setDialog('shortcuts')
          break
      }
    }

    return window.api.onMenuAction(runAction)
  }, [editor, newDocument, openDocument, importDocument, exportHtml, save, openFind, openFrontmatterEditor, closeTab, cycleTab, openFolder, openHistory])

  // F1 and Ctrl+/ open the shortcut sheet. Ctrl+/ is also an Aide menu accelerator.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isHelpKey =
        (event.key === 'F1' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) ||
        ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === '/')
      if (!isHelpKey) return
      event.preventDefault()
      setDialog('shortcuts')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    return window.api.onSaveAndClose(() => {
      void saveAllAndClose()
    })
  }, [saveAllAndClose])

  // Reload from disk when the main process detects an external change and the
  // user chooses to discard local edits in favour of the on-disk version.
  useEffect(() => {
    if (!editor) return

    return window.api.onDocumentReload((document) => {
      const parts = splitFrontmatter(document.content)
      const documentDir = dirOf(document.path ?? null)
      let html = markdownToHtml(parts.body)
      if (documentDir) html = resolveLocalImages(html, documentDir)
      editor.commands.setContent(html, { emitUpdate: false })
      setSourceMode(false)
      setSourceExit(null)
      setDocumentPath(document.path ?? null)
      setDocumentName(document.name || t('common.untitled'))
      setFrontmatter(parts.frontmatter)
      setFrontmatterDraft(null)
      const lossy = inlineHtmlWarning(parts.body, language)
      if (lossy) notifyLocal('warning', lossy)
      setFormat(document.format)
      setDirty(false)
      setJustSaved(false)
      setLinkPopover(null)
      setStats(countStats(editor.getText(STATS_TEXT_OPTIONS)))
      setCursor(readCursor(editor))
      editor.commands.focus('start')
    })
  }, [editor, t, language])

  // Open a file passed by a second instance, reusing the existing window and
  // the same unsaved-changes guard as a regular open.
  useEffect(() => {
    if (!editor) return

    return window.api.onOpenFile((path) => {
      void openDocumentAt(path)
    })
  }, [editor, openDocumentAt])

  // Drag-and-drop onto the window: open Markdown files, insert local images.
  useEffect(() => {
    if (!editor) return

    const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i

    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }
    }

    const onDrop = (event: DragEvent) => {
      const files = event.dataTransfer?.files
      if (!files || files.length === 0) return
      event.preventDefault()

      // Prefer opening a Markdown file if one is present.
      const markdown = Array.from(files).find((file) => isMarkdownFileName(file.name))
      if (markdown) {
        const path = window.api.getPathForFile(markdown)
        if (path) void openDocumentAt(path)
        return
      }

      // Otherwise insert all dropped image files, copying them into assets/.
      const dir = dirOf(documentPath)
      Array.from(files).forEach((file) => {
        if (!IMAGE_EXTENSIONS.test(file.name)) return
        const filePath = window.api.getPathForFile(file)
        if (!filePath) return

        void (async () => {
          let src: string
          if (dir) {
            const relative = await window.api.importImage(filePath)
            src = relative ? `local-file://${dir}/${relative}` : `local-file://${filePath}`
          } else {
            src = `local-file://${filePath}`
          }
          insertImageNode(editor, { src, alt: '', title: '', width: null })
        })()
      })
    }

    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [editor, openDocumentAt, documentPath])

  // Periodic crash recovery backup, stored in userData — never in the source
  // file. Every dirty tab is kept, the active one from the live editor.
  useEffect(() => {
    if (!editor) return

    const timer = window.setInterval(() => {
      const entries = new Map<string, AutosaveEntry>()
      for (const id of tabIdsRef.current) {
        if (id === activeTabIdRef.current) {
          const snapshot = autosaveRef.current
          if (!snapshot.dirty) continue
          // Store HTML rather than Markdown: serializing a 50 000-line
          // document with Turndown blocks the UI for seconds, while saving the
          // editor HTML is immediate. Drafts are restored as editor content.
          entries.set(id, {
            id,
            path: snapshot.documentPath,
            name: snapshot.documentName,
            content: snapshot.sourceMode ? snapshot.sourceText : editor.getHTML(),
            contentFormat: snapshot.sourceMode ? 'markdown' : 'html',
            frontmatter: snapshot.sourceMode ? null : snapshot.frontmatter,
            format: snapshot.format
          })
        } else {
          const tab = tabsRef.current.get(id)
          if (tab?.dirty) {
            const isHtml = !tab.sourceMode && tab.html !== null
            entries.set(id, {
              id,
              path: tab.path,
              name: tab.name,
              content: tab.sourceMode ? tab.sourceText : (tab.html ?? tab.markdown),
              contentFormat: isHtml ? 'html' : 'markdown',
              frontmatter: isHtml ? tab.frontmatter : null,
              format: tab.format
            })
          }
        }
      }
      autosaveEntriesRef.current = entries
      writeAutosaveEntries()
    }, autosaveSeconds * 1000)

    return () => window.clearInterval(timer)
  }, [editor, writeAutosaveEntries, autosaveSeconds])

  // Fallback shortcuts (useful in the browser preview and on Linux where some
  // menu accelerators can be swallowed by the system).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      // Échap closes the find bar even without a modifier.
      if (!modifier && event.key === 'Escape' && findOpen) {
        event.preventDefault()
        closeFind()
        return
      }

      // Échap also dismisses the link popover.
      if (!modifier && event.key === 'Escape' && linkPopover) {
        event.preventDefault()
        setLinkPopover(null)
        return
      }

      // Échap leaves focus mode.
      if (!modifier && event.key === 'Escape' && viewSettingsRef.current.focusMode) {
        event.preventDefault()
        void changeViewSettings({ focusMode: false })
        return
      }

      if (!modifier) return

      if (key === 's') {
        event.preventDefault()
        void save(event.shiftKey)
      } else if (key === 'o') {
        event.preventDefault()
        void openDocument()
      } else if (key === 'n') {
        event.preventDefault()
        void newDocument()
      } else if (key === 'f') {
        event.preventDefault()
        if (event.shiftKey) {
          void changeViewSettings({ focusMode: !viewSettingsRef.current.focusMode })
        } else {
          openFind()
        }
      } else if (key === 'm' && event.shiftKey) {
        event.preventDefault()
        toggleSource()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    save,
    openDocument,
    newDocument,
    openFind,
    closeFind,
    findOpen,
    linkPopover,
    changeViewSettings,
    toggleSource
  ])

  if (!editor) {
    return <div className="boot-screen">{t('app.boot.loading')}</div>
  }

  return (
    <div
      className={`app${viewSettings.focusMode ? ' app--focus' : ''}`}
      data-doc-font={viewSettings.fontFamily}
      style={typographyStyle}
    >
      <a
        className="skip-link"
        href="#editor-region"
        onClick={(event) => {
          event.preventDefault()
          if (sourceMode) {
            document.querySelector<HTMLTextAreaElement>('.source-view')?.focus()
          } else {
            editor.commands.focus()
          }
        }}
      >
        {t('app.skipLink')}
      </a>

      <AppHeader
        documentName={displayName}
        dirty={dirty}
        theme={themePreference}
        viewSettings={viewSettings}
        sourceMode={sourceMode}
        outlineOpen={outlineOpen}
        onToggleOutline={toggleOutline}
        onThemeChange={(preference) => void changeTheme(preference)}
        onViewSettingsChange={(patch) => void changeViewSettings(patch)}
        onToggleSource={toggleSource}
        onNew={() => void newDocument()}
        onTemplates={() => void openLibrary('templates')}
        onOpen={() => void openDocument()}
        onSave={() => void save()}
      />

      <TabBar
        tabs={tabSummaries}
        activeId={activeTabId}
        onSelect={switchTab}
        onClose={(id) => void closeTab(id)}
        onNew={() => newDocument()}
      />

      {findOpen && !sourceMode && (
        <FindReplaceBar
          term={findTerm}
          onTermChange={setFindTerm}
          caseSensitive={findCase}
          onToggleCase={() => setFindCase((value) => !value)}
          regex={findRegex}
          onToggleRegex={() => setFindRegex((value) => !value)}
          matchCount={matches.length}
          currentIndex={currentMatch}
          onPrev={goToPrev}
          onNext={goToNext}
          replaceTerm={replaceTerm}
          onReplaceTermChange={setReplaceTerm}
          onReplace={replaceCurrent}
          onReplaceAll={replaceAll}
          onClose={closeFind}
        />
      )}

      {!sourceMode && (
        <Toolbar
          editor={editor}
          onOpenLink={() => setDialog('link')}
          onOpenImage={() => setDialog('image')}
          onOpenSnippets={() => void openLibrary('snippets')}
        />
      )}

      <div className="body">
        {workspace && !viewSettings.focusMode && (
          <WorkspaceSidebar
            workspace={workspace}
            activePath={documentPath}
            onOpenFile={(path) => void openDocumentAt(path)}
            onRefresh={() => void refreshWorkspace()}
            onClose={() => void closeFolder()}
          />
        )}

        <main
          className={`workspace${viewSettings.typewriterMode ? ' workspace--typewriter' : ''}`}
          ref={workspaceRef}
          id="editor-region"
          tabIndex={-1}
        >
          <div
            className={`page page--${viewSettings.pageWidth}`}
            role="tabpanel"
            id="editor-panel"
            aria-labelledby={`tab-${activeTabId}`}
          >
            {sourceMode ? (
              <SourceView value={sourceText} onChange={onSourceChange} />
            ) : (
              <>
                {(frontmatter !== null || frontmatterDraft !== null) && (
                  <FrontmatterPanel
                    value={frontmatter}
                    draft={frontmatterDraft}
                    onEdit={openFrontmatterEditor}
                    onDraftChange={setFrontmatterDraft}
                    onSave={saveFrontmatter}
                    onCancel={() => setFrontmatterDraft(null)}
                    onDelete={deleteFrontmatter}
                  />
                )}
                <EditorContent editor={editor} />
              </>
            )}
          </div>
        </main>

        {outlineOpen && !sourceMode && !viewSettings.focusMode && (
          <OutlinePanel
            items={outline}
            activeIndex={activeHeading}
            onSelect={goToHeading}
            onClose={toggleOutline}
          />
        )}
      </div>

      <StatusBar
        words={stats.words}
        characters={stats.characters}
        cursor={cursor}
        wordGoal={viewSettings.wordGoal}
        onWordGoalChange={(goal) => void changeViewSettings({ wordGoal: goal })}
        documentPath={documentPath}
        dirty={dirty}
        justSaved={justSaved}
        format={format}
      />

      {!sourceMode && (
        <FloatingToolbar
          editor={editor}
          onOpenLink={() => setDialog('link')}
        />
      )}

      {sourceExit && (
        <SourceExitDialog
          tags={sourceExit.tags}
          onStay={() => setSourceExit(null)}
          onProceed={() => leaveSource(true)}
        />
      )}

      {viewSettings.focusMode && (
        <button
          type="button"
          className="focus-exit"
          onClick={() => void changeViewSettings({ focusMode: false })}
          title={t('app.focusExitTitle')}
        >
          <Minimize2 size={15} strokeWidth={2} />
          <span>{t('app.focusExit')}</span>
        </button>
      )}

      {dialog === 'link' && (
        <UrlDialog
          mode="link"
          initialValue={(editor.getAttributes('link').href as string | undefined) ?? ''}
          onSubmit={applyLink}
          onRemove={editor.isActive('link') ? removeLink : undefined}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}

      {dialog === 'preferences' && preferences && (
        <PreferencesDialog
          preferences={preferences}
          theme={themePreference}
          pageWidth={viewSettings.pageWidth}
          onPreferencesChange={(patch) => void updatePreferences(patch)}
          onThemeChange={(preference) => void changeTheme(preference)}
          onPageWidthChange={(width) => void changeViewSettings({ pageWidth: width })}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === 'history' && documentPath && (
        <HistoryDialog
          path={documentPath}
          onRestore={restoreVersion}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === 'pdf' && (
        <PdfExportDialog
          options={pdfOptions}
          onChange={setPdfOptions}
          onSubmit={() => void exportPdf()}
          onClose={() => setDialog(null)}
        />
      )}

      {(dialog === 'templates' || dialog === 'snippets') && library && (
        <LibraryDialog
          mode={dialog}
          entries={dialog === 'templates' ? library.templates : library.snippets}
          folder={library.folder}
          onPick={dialog === 'templates' ? createFromTemplate : insertSnippet}
          onOpenFolder={() => void window.api.openLibraryFolder()}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === 'image' && (
        <UrlDialog
          mode="image"
          onSubmit={applyImage}
          onBrowse={() => window.api.pickImage()}
          onClose={() => setDialog(null)}
        />
      )}

      {linkPopover && (
        <LinkPopover
          href={linkPopover.href}
          top={linkPopover.top}
          left={linkPopover.left}
          onOpen={openLinkFromPopover}
          onEdit={editLinkFromPopover}
          onCopy={copyLinkFromPopover}
          onRemove={removeLinkFromPopover}
        />
      )}
    </div>
  )
}

export default function App() {
  const { t } = useI18n()
  const [initial, setInitial] = useState<InitialDocument | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    window.api
      .getInitialDocument()
      .then((document) => {
        performance.mark('cyonima:document-loaded')
        setInitial(document)
      })
      .catch((error: unknown) => {
        setFailed(true)
        window.api.log('error', 'Impossible de charger le document initial', {
          message: error instanceof Error ? error.message : String(error)
        })
      })
  }, [])

  let content: ReactNode
  if (failed) {
    content = <div className="boot-screen">{t('app.boot.failed')}</div>
  } else if (!initial) {
    content = (
      <div className="boot-screen">
        <span className="boot-mark">C</span>
        <span>{t('app.boot.opening')}</span>
      </div>
    )
  } else {
    content = (
      <ErrorBoundary>
        <Workspace key={`${initial.path ?? 'untitled'}-${initial.content.length}`} initial={initial} />
      </ErrorBoundary>
    )
  }

  return (
    <>
      {content}
      <Notifications />
    </>
  )
}
