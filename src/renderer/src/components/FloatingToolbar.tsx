import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import {
  Bold,
  ChevronDown,
  Code,
  Highlighter,
  Italic,
  Link2,
  Strikethrough,
  Type,
  Underline,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { HIGHLIGHT_COLORS, TEXT_COLORS } from './Toolbar'

// ---------------------------------------------------------------------------
// Color sub-panel
// ---------------------------------------------------------------------------

interface ColorSubPanelProps {
  editor: Editor
  mode: 'text' | 'highlight'
  onClose: () => void
}

function ColorSubPanel({ editor, mode, onClose }: ColorSubPanelProps) {
  const { t } = useI18n()
  const colors = mode === 'text' ? TEXT_COLORS : HIGHLIGHT_COLORS
  const current =
    mode === 'text'
      ? (editor.getAttributes('textStyle').color as string | undefined)
      : (editor.getAttributes('highlight').color as string | undefined)

  const apply = (value: string | null) => {
    if (mode === 'text') {
      if (value === null) editor.chain().focus().unsetColor().run()
      else editor.chain().focus().setColor(value).run()
    } else {
      if (value === null) editor.chain().focus().unsetHighlight().run()
      else editor.chain().focus().setHighlight({ color: value }).run()
    }
    onClose()
  }

  return (
    <div className="ft-color-panel" role="menu">
      {colors.map(({ label, value }) => (
        <button
          key={value ?? '__none__'}
          type="button"
          role="menuitem"
          className={`ft-color-swatch${current === value ? ' is-active' : ''}${value === null ? ' ft-color-swatch--reset' : ''}`}
          style={value ? ({ '--swatch': value } as React.CSSProperties) : undefined}
          title={t(label)}
          aria-label={t(label)}
          aria-pressed={current === value}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => apply(value)}
        >
          {value === null && (mode === 'text' ? <Type size={10} strokeWidth={2.2} /> : <span className="ft-swatch-none" />)}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main FloatingToolbar component
// ---------------------------------------------------------------------------

interface FloatingToolbarProps {
  editor: Editor
  onOpenLink: () => void
}

/** Returns true when the selection sits entirely inside a code block. */
function selectionInCodeBlock(editor: Editor): boolean {
  return editor.isActive('codeBlock')
}

export function FloatingToolbar({ editor, onOpenLink }: FloatingToolbarProps) {
  const { t } = useI18n()
  const toolbarRef = useRef<HTMLDivElement>(null as unknown as HTMLDivElement)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [colorPanel, setColorPanel] = useState<'text' | 'highlight' | null>(null)
  // Track mouse-down to avoid showing the toolbar on plain clicks (no selection).
  const mouseWasDownRef = useRef(false)

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      textColor: (e.getAttributes('textStyle').color as string | undefined) ?? null,
      highlightColor: (e.getAttributes('highlight').color as string | undefined) ?? null,
      empty: e.state.selection.empty,
    }),
  })

  // Compute the toolbar position after every selection change.
  useLayoutEffect(() => {
    const { selection } = editor.state

    if (selection.empty || selectionInCodeBlock(editor)) {
      setPos(null)
      setColorPanel(null)
      return
    }

    // Only show after a mouse-driven selection.
    if (!mouseWasDownRef.current) {
      setPos(null)
      return
    }

    const { view } = editor
    const from = selection.from
    const to = selection.to

    // Get the bounding rect of the selection range using ProseMirror coords.
    const start = view.coordsAtPos(from)
    const end = view.coordsAtPos(to)

    // The toolbar should sit above the selection, horizontally centred.
    const left = (start.left + end.left) / 2
    const top = Math.min(start.top, end.top)

    setPos({ top, left })
  }, [editor, state.empty])

  // Track mouse events to know when a drag-selection finishes.
  useEffect(() => {
    const editorDom = editor.view.dom

    const onMouseDown = () => {
      mouseWasDownRef.current = true
    }

    const onMouseUp = () => {
      // Allow the selection state to settle before computing position.
      window.setTimeout(() => {
        mouseWasDownRef.current = false
      }, 0)
    }

    editorDom.addEventListener('mousedown', onMouseDown)
    editorDom.addEventListener('mouseup', onMouseUp)
    return () => {
      editorDom.removeEventListener('mousedown', onMouseDown)
      editorDom.removeEventListener('mouseup', onMouseUp)
    }
  }, [editor])

  // Close color sub-panel when clicking outside.
  useEffect(() => {
    if (!colorPanel) return
    const onPointerDown = (e: PointerEvent) => {
      if (!toolbarRef.current?.contains(e.target as Node)) {
        setColorPanel(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [colorPanel])

  if (!pos) return null

  return (
    <FloatingToolbarPortal top={pos.top} left={pos.left} toolbarRef={toolbarRef}>
      {/* ---- Bold ---- */}
      <button
        type="button"
        className={`ft-btn${state.bold ? ' is-active' : ''}`}
        title={`${t('format.bold')} (Ctrl+B)`}
        aria-label={t('format.bold')}
        aria-pressed={state.bold}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={14} strokeWidth={2.4} />
      </button>

      {/* ---- Italic ---- */}
      <button
        type="button"
        className={`ft-btn${state.italic ? ' is-active' : ''}`}
        title={`${t('format.italic')} (Ctrl+I)`}
        aria-label={t('format.italic')}
        aria-pressed={state.italic}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={14} strokeWidth={2.2} />
      </button>

      {/* ---- Underline ---- */}
      <button
        type="button"
        className={`ft-btn${state.underline ? ' is-active' : ''}`}
        title={`${t('format.underline')} (Ctrl+U)`}
        aria-label={t('format.underline')}
        aria-pressed={state.underline}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline size={14} strokeWidth={2.2} />
      </button>

      {/* ---- Strikethrough ---- */}
      <button
        type="button"
        className={`ft-btn${state.strike ? ' is-active' : ''}`}
        title={t('format.strike')}
        aria-label={t('format.strike')}
        aria-pressed={state.strike}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={14} strokeWidth={2.2} />
      </button>

      {/* ---- Inline code ---- */}
      <button
        type="button"
        className={`ft-btn${state.code ? ' is-active' : ''}`}
        title={t('format.inlineCode')}
        aria-label={t('format.inlineCode')}
        aria-pressed={state.code}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code size={14} strokeWidth={2.2} />
      </button>

      <span className="ft-divider" aria-hidden="true" />

      {/* ---- Link ---- */}
      <button
        type="button"
        className={`ft-btn${state.link ? ' is-active' : ''}`}
        title={`${t('format.link')} (Ctrl+K)`}
        aria-label={t('format.link')}
        aria-pressed={state.link}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onOpenLink}
      >
        <Link2 size={14} strokeWidth={2.1} />
      </button>

      <span className="ft-divider" aria-hidden="true" />

      {/* ---- Text color ---- */}
      <div className="ft-color-wrap">
        <button
          type="button"
          className={`ft-btn ft-color-btn${colorPanel === 'text' ? ' is-active' : ''}`}
          title={t('format.textColor')}
          aria-label={t('format.textColor')}
          aria-expanded={colorPanel === 'text'}
          aria-haspopup="menu"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setColorPanel((p) => (p === 'text' ? null : 'text'))}
        >
          <span className="ft-color-icon">
            <Type size={13} strokeWidth={2.1} />
            <span
              className="ft-color-bar"
              style={state.textColor ? ({ '--bar': state.textColor } as React.CSSProperties) : undefined}
            />
          </span>
          <ChevronDown size={8} strokeWidth={2.8} />
        </button>
        {colorPanel === 'text' && (
          <ColorSubPanel editor={editor} mode="text" onClose={() => setColorPanel(null)} />
        )}
      </div>

      {/* ---- Highlight color ---- */}
      <div className="ft-color-wrap">
        <button
          type="button"
          className={`ft-btn ft-color-btn${colorPanel === 'highlight' ? ' is-active' : ''}`}
          title={t('format.highlight')}
          aria-label={t('format.highlight')}
          aria-expanded={colorPanel === 'highlight'}
          aria-haspopup="menu"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setColorPanel((p) => (p === 'highlight' ? null : 'highlight'))}
        >
          <span className="ft-color-icon">
            <Highlighter size={13} strokeWidth={2} />
            <span
              className="ft-color-bar"
              style={
                state.highlightColor
                  ? ({ '--bar': state.highlightColor } as React.CSSProperties)
                  : undefined
              }
            />
          </span>
          <ChevronDown size={8} strokeWidth={2.8} />
        </button>
        {colorPanel === 'highlight' && (
          <ColorSubPanel editor={editor} mode="highlight" onClose={() => setColorPanel(null)} />
        )}
      </div>
    </FloatingToolbarPortal>
  )
}

// ---------------------------------------------------------------------------
// Portal — renders the toolbar at a fixed viewport position so it floats
// above the editor content regardless of scroll or stacking context.
// ---------------------------------------------------------------------------

interface PortalProps {
  top: number
  left: number
  toolbarRef: React.RefObject<HTMLDivElement>
  children: React.ReactNode
}

function FloatingToolbarPortal({ top, left, toolbarRef, children }: PortalProps) {
  const { t } = useI18n()
  // We render inline (not in a portal) because Electron doesn't have cross-
  // frame concerns and inline rendering is simpler and more reliable.
  // Position is fixed so the toolbar stays on screen regardless of scroll.
  const [style, setStyle] = useState<React.CSSProperties>({
    visibility: 'hidden',
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 300,
  })

  // After first render we know the toolbar dimensions and can centre it properly.
  useLayoutEffect(() => {
    const el = toolbarRef.current
    if (!el) return

    const TOOLBAR_OFFSET = 10 // px above the selection top edge
    const w = el.offsetWidth
    const h = el.offsetHeight
    const vpW = window.innerWidth
    const vpH = window.innerHeight

    let computedLeft = left - w / 2
    let computedTop = top - h - TOOLBAR_OFFSET

    // Clamp to viewport with a small margin.
    const MARGIN = 8
    computedLeft = Math.max(MARGIN, Math.min(computedLeft, vpW - w - MARGIN))
    computedTop = Math.max(MARGIN, computedTop)

    // If there is not enough room above, flip below the selection.
    if (computedTop < MARGIN) {
      computedTop = top + TOOLBAR_OFFSET + 4
    }

    // Clamp below too.
    computedTop = Math.min(computedTop, vpH - h - MARGIN)

    setStyle({
      visibility: 'visible',
      position: 'fixed',
      top: computedTop,
      left: computedLeft,
      zIndex: 300,
    })
  }, [top, left, toolbarRef])

  return (
    <div
      ref={toolbarRef}
      className="floating-toolbar"
      style={style}
      role="toolbar"
      aria-label={t('format.quickToolbarAria')}
      // Prevent the editor from losing focus on click.
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </div>
  )
}
