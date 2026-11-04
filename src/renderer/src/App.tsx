import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { FileFormat, InitialDocument, MenuAction, OpenFileResult } from '../../shared/types'
import { AppHeader } from './components/AppHeader'
import { ErrorBoundary } from './components/ErrorBoundary'
import { FindReplaceBar } from './components/FindReplaceBar'
import { FrontmatterPanel } from './components/FrontmatterPanel'
import { Notifications } from './components/Notifications'
import { StatusBar } from './components/StatusBar'
import { Toolbar } from './components/Toolbar'
import { UrlDialog } from './components/UrlDialog'
import { createExtensions } from './editor/extensions'
import {
  countDocumentStats,
  htmlToMarkdown,
  joinFrontmatter,
  markdownToHtml,
  splitFrontmatter
} from './editor/markdown'
import { buildSearchRegex, findMatchesInSegments } from './lib/search'
import type { SearchMatch, TextSegment } from './lib/search'
import { isMarkdownFileName } from './lib/fileTypes'

type DialogMode = 'link' | 'image' | null

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
  const [stats, setStats] = useState(() => countDocumentStats(initialParts.body))
  const [dialog, setDialog] = useState<DialogMode>(null)
  const savingRef = useRef(false)
  const statsTimerRef = useRef<number | null>(null)

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

  const autosaveRef = useRef({ dirty, documentPath, documentName, frontmatter, format })
  autosaveRef.current = { dirty, documentPath, documentName, frontmatter, format }

  const extensions = useMemo(() => createExtensions(), [])

  const editor = useEditor({
    extensions,
    content: markdownToHtml(initialParts.body),
    autofocus: 'start',
    editorProps: {
      attributes: {
        class: 'md-editor',
        spellcheck: 'true',
        'aria-label': 'Document Markdown'
      },
      handleClick: (_view, _pos, event) => {
        const anchor = (event.target as HTMLElement | null)?.closest('a')
        if (!anchor) return false

        event.preventDefault()
        if (event.metaKey || event.ctrlKey) {
          void window.api.openExternal(anchor.href)
        }
        return true
      }
    },
    onCreate: ({ editor: current }) => {
      setStats(countDocumentStats(current.getText()))
    },
    onUpdate: ({ editor: current }) => {
      setDirty(true)
      // Debounce the word/character count: recomputing it on every keystroke
      // walks the whole document, which is wasteful on large files.
      if (statsTimerRef.current) window.clearTimeout(statsTimerRef.current)
      statsTimerRef.current = window.setTimeout(() => {
        setStats(countDocumentStats(current.getText()))
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

  const getMarkdown = useCallback(() => {
    return editor ? htmlToMarkdown(editor.getHTML()) : ''
  }, [editor])

  const save = useCallback(
    async (saveAs = false): Promise<boolean> => {
      if (!editor || savingRef.current) return false
      savingRef.current = true

      try {
        const result = await window.api.saveFile({
          content: joinFrontmatter(frontmatter, getMarkdown()),
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
    [editor, getMarkdown, documentPath, documentName, frontmatter, format]
  )

  const confirmReplacement = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true
    const choice = await window.api.confirmDiscard()
    if (choice === 'cancel') return false
    if (choice === 'save') return save()
    return true
  }, [dirty, save])

  const newDocument = useCallback(async () => {
    if (!editor) return
    if (!(await confirmReplacement())) return

    editor.commands.setContent('', { emitUpdate: false })
    setDocumentPath(null)
    setDocumentName('Sans titre')
    setFrontmatter(null)
    setFormat(initial.defaultFormat)
    setDirty(false)
    setJustSaved(false)
    setStats({ words: 0, characters: 0 })
    void window.api.clearAutosave()
    editor.commands.focus('start')
  }, [editor, confirmReplacement, initial.defaultFormat])

  const applyOpenedDocument = useCallback(
    (result: OpenFileResult) => {
      if (!editor || result.canceled || result.content == null) return

      const parts = splitFrontmatter(result.content)
      editor.commands.setContent(markdownToHtml(parts.body), { emitUpdate: false })
      setDocumentPath(result.path ?? null)
      setDocumentName(result.name ?? 'Sans titre')
      setFrontmatter(parts.frontmatter)
      setFormat(result.format ?? initial.defaultFormat)
      setDirty(false)
      setJustSaved(false)
      setStats(countDocumentStats(editor.getText()))
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
        editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
      }
      setDialog(null)
    },
    [editor]
  )

  const applyImage = useCallback(
    (raw: string) => {
      if (!editor) return
      const src = normalizeImage(raw)
      if (!src) return
      editor.chain().focus().setImage({ src, alt: '' }).run()
      setDialog(null)
    },
    [editor]
  )

  const removeLink = useCallback(() => {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run()
    setDialog(null)
  }, [editor])

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
      }
    }

    return window.api.onMenuAction(runAction)
  }, [editor, newDocument, openDocument, save, openFind])

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
      editor.commands.setContent(markdownToHtml(parts.body), { emitUpdate: false })
      setDocumentPath(document.path ?? null)
      setDocumentName(document.name || 'Sans titre')
      setFrontmatter(parts.frontmatter)
      setFormat(document.format)
      setDirty(false)
      setJustSaved(false)
      setStats(countDocumentStats(editor.getText()))
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

  // Drag-and-drop a Markdown file onto the window to open it (guarded).
  // Images are ignored here; they are handled by image drop in 1.4.
  useEffect(() => {
    if (!editor) return

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

      const markdown = Array.from(files).find((file) => isMarkdownFileName(file.name))
      if (!markdown) return

      const path = window.api.getPathForFile(markdown)
      if (path) void openDocumentAt(path)
    }

    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [editor, openDocumentAt])

  // Periodic crash recovery backup, stored in userData — never in the source
  // file. Only runs while the document has unsaved changes.
  useEffect(() => {
    if (!editor) return

    const timer = window.setInterval(() => {
      const snapshot = autosaveRef.current
      if (!snapshot.dirty) return

      const content = joinFrontmatter(snapshot.frontmatter, htmlToMarkdown(editor.getHTML()))
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
        openFind()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save, openDocument, newDocument, openFind, closeFind, findOpen])

  if (!editor) {
    return <div className="boot-screen">Chargement de l’éditeur…</div>
  }

  return (
    <div className="app">
      <AppHeader
        documentName={documentName}
        dirty={dirty}
        onNew={() => void newDocument()}
        onOpen={() => void openDocument()}
        onSave={() => void save()}
      />

      {findOpen && (
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

      <Toolbar
        editor={editor}
        onOpenLink={() => setDialog('link')}
        onOpenImage={() => setDialog('image')}
      />

      <main className="workspace">
        <div className="page">
          {frontmatter && <FrontmatterPanel value={frontmatter} />}
          <EditorContent editor={editor} />
        </div>
      </main>

      <StatusBar
        words={stats.words}
        characters={stats.characters}
        documentPath={documentPath}
        dirty={dirty}
        justSaved={justSaved}
        format={format}
      />

      {dialog === 'link' && (
        <UrlDialog
          mode="link"
          initialValue={(editor.getAttributes('link').href as string | undefined) ?? ''}
          onSubmit={applyLink}
          onRemove={editor.isActive('link') ? removeLink : undefined}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === 'image' && (
        <UrlDialog
          mode="image"
          onSubmit={applyImage}
          onClose={() => setDialog(null)}
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
