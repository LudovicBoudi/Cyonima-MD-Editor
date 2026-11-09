import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { Minimize2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type {
  FileFormat,
  InitialDocument,
  LibraryEntry,
  LibraryState,
  MenuAction,
  OpenFileResult,
  ThemePreference,
  ViewSettings
} from '../../shared/types'
import { AppHeader } from './components/AppHeader'
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
import { isContentChange } from './editor/documentChanges'
import { findUnrepresentedInlineHtml } from './editor/sourceMode'
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

type DialogMode = 'link' | 'image' | 'shortcuts' | 'templates' | 'snippets' | null

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

function Workspace({ initial }: { initial: InitialDocument }) {
  const initialParts = useMemo(() => splitFrontmatter(initial.content), [initial.content])
  const [documentPath, setDocumentPath] = useState<string | null>(initial.path)
  const [documentName, setDocumentName] = useState(initial.name || 'Sans titre')
  const [frontmatter, setFrontmatter] = useState<string | null>(initialParts.frontmatter)
  const [format, setFormat] = useState<FileFormat>(initial.format)
  const [dirty, setDirty] = useState(initial.unsaved ?? false)
  const [justSaved, setJustSaved] = useState(false)
  const [stats, setStats] = useState(() => countStats(initialParts.body))
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

  const autosaveRef = useRef({
    dirty,
    documentPath,
    documentName,
    frontmatter,
    format,
    sourceMode,
    sourceText
  })
  autosaveRef.current = {
    dirty,
    documentPath,
    documentName,
    frontmatter,
    format,
    sourceMode,
    sourceText
  }

  const extensions = useMemo(
    () =>
      createExtensions({
        getDocumentDir: () => (documentPathRef.current ? dirOf(documentPathRef.current) : null)
      }),
    []
  )

  const initialContent = useMemo(() => {
    const html = markdownToHtml(initialParts.body)
    const dir = dirOf(initial.path)
    return dir ? resolveLocalImages(html, dir) : html
  }, [initialParts.body, initial.path])

  const editor = useEditor({
    extensions,
    content: initialContent,
    autofocus: 'start',
    editorProps: {
      attributes: {
        class: 'md-editor',
        spellcheck: 'true',
        'aria-label': 'Document Markdown'
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
    const html = unresolveLocalImages(editor.getHTML(), dirOf(documentPath))
    return htmlToMarkdown(html)
  }, [editor, documentPath])

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
        void window.api.clearAutosave()
        return true
      } finally {
        savingRef.current = false
      }
    },
    [editor, getMarkdown, documentPath, documentName, frontmatter, format, sourceMode, sourceText]
  )

  const confirmReplacement = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true
    const choice = await window.api.confirmDiscard()
    if (choice === 'cancel') return false
    if (choice === 'save') return save()
    return true
  }, [dirty, save])

  const newDocument = useCallback(
    async (body = '') => {
    if (!editor) return
    if (!(await confirmReplacement())) return

    editor.commands.setContent(body ? markdownToHtml(body) : '', { emitUpdate: false })
    setSourceMode(false)
    setSourceExit(null)
    setDocumentPath(null)
    setDocumentName('Sans titre')
    setFrontmatter(null)
    setFormat(initial.defaultFormat)
    setDirty(body.length > 0)
    setJustSaved(false)
    setLinkPopover(null)
    setStats(countStats(editor.getText(STATS_TEXT_OPTIONS)))
    void window.api.clearAutosave()
    editor.commands.focus('start')
    },
    [editor, confirmReplacement, initial.defaultFormat]
  )

  const applyOpenedDocument = useCallback(
    (result: OpenFileResult) => {
      if (!editor || result.canceled || result.content == null) return

      const parts = splitFrontmatter(result.content)
      const documentDir = dirOf(result.path ?? null)
      let html = markdownToHtml(parts.body)
      if (documentDir) html = resolveLocalImages(html, documentDir)
      editor.commands.setContent(html, { emitUpdate: false })
      setSourceMode(false)
      setSourceExit(null)
      setDocumentPath(result.path ?? null)
      setDocumentName(result.name ?? 'Sans titre')
      setFrontmatter(parts.frontmatter)
      setFormat(result.format ?? initial.defaultFormat)
      setDirty(false)
      setJustSaved(false)
      setLinkPopover(null)
      setStats(countStats(editor.getText(STATS_TEXT_OPTIONS)))
      setCursor(readCursor(editor))
      void window.api.clearAutosave()
      editor.commands.focus('start')
    },
    [editor, initial.defaultFormat]
  )

  const openDocument = useCallback(async () => {
    if (!editor) return
    if (!(await confirmReplacement())) return

    applyOpenedDocument(await window.api.openFile())
  }, [editor, confirmReplacement, applyOpenedDocument])

  const openDocumentAt = useCallback(
    async (path: string) => {
      if (!editor) return
      if (!(await confirmReplacement())) return

      applyOpenedDocument(await window.api.openFileAt(path))
    },
    [editor, confirmReplacement, applyOpenedDocument]
  )

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

  const openLibrary = useCallback(async (mode: 'templates' | 'snippets') => {
    setLibrary(await window.api.getLibrary())
    setDialog(mode)
  }, [])

  const createFromTemplate = useCallback(
    (entry: LibraryEntry) => {
      setDialog(null)
      void newDocument(expandPlaceholders(entry.content))
    },
    [newDocument]
  )

  const insertSnippet = useCallback(
    (entry: LibraryEntry) => {
      if (!editor) return
      setDialog(null)
      editor.chain().focus().run()
      // Pasting goes through the clean-paste handler, so Markdown in a snippet
      // becomes structure, as it does for any pasted Markdown.
      insertPlainText(editor, expandPlaceholders(entry.content), () => null)
    },
    [editor]
  )

  const onSourceChange = useCallback((value: string) => {
    setSourceText(value)
    setDirty(true)
  }, [])

  // Setting a whole document does not emit an update, but it always dispatches
  // a transaction, so the outline listens to transactions.
  useEffect(() => {
    if (!editor) return

    const refresh = () => {
      if (outlineTimerRef.current) window.clearTimeout(outlineTimerRef.current)
      outlineTimerRef.current = window.setTimeout(() => setOutline(readOutline(editor)), 150)
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
  }, [editor])

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
    window.api.setDocumentMeta({ name: documentName, dirty })
  }, [documentName, dirty])

  useEffect(() => {
    if (!justSaved) return
    const timer = window.setTimeout(() => setJustSaved(false), 2400)
    return () => window.clearTimeout(timer)
  }, [justSaved])

  useEffect(() => {
    const base = documentName === 'Sans titre' ? 'Sans titre' : documentName
    document.title = `${dirty ? '• ' : ''}${base} — Cyonima MD Editor`
  }, [documentName, dirty])

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
  }, [editor, newDocument, openDocument, save, openFind])

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
      void (async () => {
        const saved = await save()
        if (saved) window.api.closeWindow()
      })()
    })
  }, [save])

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
      setDocumentName(document.name || 'Sans titre')
      setFrontmatter(parts.frontmatter)
      setFormat(document.format)
      setDirty(false)
      setJustSaved(false)
      setLinkPopover(null)
      setStats(countStats(editor.getText(STATS_TEXT_OPTIONS)))
      setCursor(readCursor(editor))
      editor.commands.focus('start')
    })
  }, [editor])

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
  // file. Only runs while the document has unsaved changes.
  useEffect(() => {
    if (!editor) return

    const timer = window.setInterval(() => {
      const snapshot = autosaveRef.current
      if (!snapshot.dirty) return

      const html = unresolveLocalImages(editor.getHTML(), dirOf(snapshot.documentPath))
      const content = snapshot.sourceMode
        ? snapshot.sourceText
        : joinFrontmatter(snapshot.frontmatter, htmlToMarkdown(html))
      void window.api.saveAutosave({
        path: snapshot.documentPath,
        name: snapshot.documentName,
        content,
        format: snapshot.format
      })
    }, 7000)

    return () => window.clearInterval(timer)
  }, [editor])

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
    return <div className="boot-screen">Chargement de l’éditeur…</div>
  }

  return (
    <div
      className={`app${viewSettings.focusMode ? ' app--focus' : ''}`}
      data-doc-font={viewSettings.fontFamily}
      style={typographyStyle}
    >
      <AppHeader
        documentName={documentName}
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
        <main
          className={`workspace${viewSettings.typewriterMode ? ' workspace--typewriter' : ''}`}
          ref={workspaceRef}
        >
          <div className={`page page--${viewSettings.pageWidth}`}>
            {sourceMode ? (
              <SourceView value={sourceText} onChange={onSourceChange} />
            ) : (
              <>
                {frontmatter && <FrontmatterPanel value={frontmatter} />}
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
          title="Quitter le mode concentration (Échap)"
        >
          <Minimize2 size={15} strokeWidth={2} />
          <span>Quitter</span>
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
  const [initial, setInitial] = useState<InitialDocument | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    window.api
      .getInitialDocument()
      .then(setInitial)
      .catch((error: unknown) => {
        setFailed(true)
        window.api.log('error', 'Impossible de charger le document initial', {
          message: error instanceof Error ? error.message : String(error)
        })
      })
  }, [])

  let content: ReactNode
  if (failed) {
    content = <div className="boot-screen">Impossible de charger le document.</div>
  } else if (!initial) {
    content = (
      <div className="boot-screen">
        <span className="boot-mark">C</span>
        <span>Ouverture de l’éditeur…</span>
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
