import { EditorContent, useEditor } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FileFormat, InitialDocument, MenuAction } from '../../shared/types'
import { AppHeader } from './components/AppHeader'
import { FrontmatterPanel } from './components/FrontmatterPanel'
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

function Workspace({ initial }: { initial: InitialDocument }) {
  const initialParts = useMemo(() => splitFrontmatter(initial.content), [initial.content])
  const [documentPath, setDocumentPath] = useState<string | null>(initial.path)
  const [documentName, setDocumentName] = useState(initial.name || 'Sans titre')
  const [frontmatter, setFrontmatter] = useState<string | null>(initialParts.frontmatter)
  const [format, setFormat] = useState<FileFormat>(initial.format)
  const [dirty, setDirty] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [stats, setStats] = useState(() => countDocumentStats(initialParts.body))
  const [dialog, setDialog] = useState<DialogMode>(null)
  const savingRef = useRef(false)

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
      setStats(countDocumentStats(current.getText()))
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
    editor.commands.focus('start')
  }, [editor, confirmReplacement, initial.defaultFormat])

  const openDocument = useCallback(async () => {
    if (!editor) return
    if (!(await confirmReplacement())) return

    const result = await window.api.openFile()
    if (result.canceled || result.content == null) return

    const parts = splitFrontmatter(result.content)
    editor.commands.setContent(markdownToHtml(parts.body), { emitUpdate: false })
    setDocumentPath(result.path ?? null)
    setDocumentName(result.name ?? 'Sans titre')
    setFrontmatter(parts.frontmatter)
    setFormat(result.format ?? initial.defaultFormat)
    setDirty(false)
    setJustSaved(false)
    setStats(countDocumentStats(editor.getText()))
    editor.commands.focus('start')
  }, [editor, confirmReplacement, initial.defaultFormat])

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
    window.api.setDocumentMeta({ name: documentName, path: documentPath, dirty })
  }, [documentName, documentPath, dirty])

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
      }
    }

    return window.api.onMenuAction(runAction)
  }, [editor, newDocument, openDocument, save])

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

  // Fallback shortcuts (useful in the browser preview and on Linux where some
  // menu accelerators can be swallowed by the system).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey
      if (!modifier) return
      const key = event.key.toLowerCase()

      if (key === 's') {
        event.preventDefault()
        void save(event.shiftKey)
      } else if (key === 'o') {
        event.preventDefault()
        void openDocument()
      } else if (key === 'n') {
        event.preventDefault()
        void newDocument()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save, openDocument, newDocument])

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
      .catch(() => setFailed(true))
  }, [])

  if (failed) {
    return <div className="boot-screen">Impossible de charger le document.</div>
  }

  if (!initial) {
    return (
      <div className="boot-screen">
        <span className="boot-mark">C</span>
        <span>Ouverture de l’éditeur…</span>
      </div>
    )
  }

  return <Workspace key={`${initial.path ?? 'untitled'}-${initial.content.length}`} initial={initial} />
}
