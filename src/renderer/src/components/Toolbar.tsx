import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  Check,
  ChevronDown,
  Code,
  Columns3,
  Copy,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  PanelTop,
  Quote,
  Redo2,
  Rows3,
  Strikethrough,
  Table2,
  Trash2,
  Type,
  Underline,
  Undo2,
  ImagePlus,
  RemoveFormatting,
  Superscript,
  TextCursorInput
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react'
import { codeLanguageOptions } from '../editor/codeLanguages'
import { insertFootnote } from '../editor/footnotes'
import { focusEdge, focusStep } from '../lib/focus'
import {
  isTableHeaderEnabled,
  setColumnAlignment,
  toggleTableHeader
} from '../editor/tableCommands'
import type { TranslationKey } from '../../../shared/i18n'
import { useI18n } from '../lib/i18n'

// ---------------------------------------------------------------------------
// Color palette — text color and highlight
// ---------------------------------------------------------------------------

export const TEXT_COLORS: ReadonlyArray<{ label: TranslationKey; value: string | null }> = [
  { label: 'format.color.default', value: null },
  { label: 'format.color.red', value: '#c0392b' },
  { label: 'format.color.orange', value: '#e67e22' },
  { label: 'format.color.darkYellow', value: '#d4ac0d' },
  { label: 'format.color.green', value: '#27ae60' },
  { label: 'format.color.teal', value: '#16a085' },
  { label: 'format.color.blue', value: '#2980b9' },
  { label: 'format.color.purple', value: '#8e44ad' },
  { label: 'format.color.pink', value: '#e91e8c' },
  { label: 'format.color.darkGray', value: '#555555' },
  { label: 'format.color.gray', value: '#999999' }
]

export const HIGHLIGHT_COLORS: ReadonlyArray<{ label: TranslationKey; value: string | null }> = [
  { label: 'format.highlight.none', value: null },
  { label: 'format.highlight.yellow', value: '#fff176' },
  { label: 'format.highlight.green', value: '#b9f6ca' },
  { label: 'format.highlight.blue', value: '#b3e5fc' },
  { label: 'format.highlight.pink', value: '#f8bbd0' },
  { label: 'format.highlight.purple', value: '#e1bee7' },
  { label: 'format.highlight.orange', value: '#ffe0b2' },
  { label: 'format.highlight.gray', value: '#eceff1' }
]

interface ColorPaletteProps {
  editor: Editor
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
}

function ColorPalette({ editor, onClose, triggerRef }: ColorPaletteProps) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const currentColor = editor.getAttributes('textStyle').color as string | undefined
  const currentHighlight = editor.getAttributes('highlight').color as string | undefined

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, triggerRef])

  const onPaletteKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const active = document.activeElement
    if (!(active instanceof HTMLButtonElement) || !ref.current?.contains(active)) return

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      focusStep(ref.current, active, 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusStep(ref.current, active, -1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusEdge(ref.current, 'first')
    } else if (event.key === 'End') {
      event.preventDefault()
      focusEdge(ref.current, 'last')
    }
  }

  const applyColor = (value: string | null) => {
    if (value === null) {
      editor.chain().focus().unsetColor().run()
    } else {
      editor.chain().focus().setColor(value).run()
    }
    onClose()
  }

  const applyHighlight = (value: string | null) => {
    if (value === null) {
      editor.chain().focus().unsetHighlight().run()
    } else {
      editor.chain().focus().setHighlight({ color: value }).run()
    }
    onClose()
  }

  return (
    <div
      ref={ref}
      className="color-palette"
      role="dialog"
      aria-label={t('format.paletteAria')}
      onKeyDown={onPaletteKeyDown}
    >
      <div className="color-palette-section">
        <span className="color-palette-label">{t('format.textColor')}</span>
        <div className="color-palette-swatches">
          {TEXT_COLORS.map(({ label, value }) => (
            <button
              key={value ?? 'default'}
              type="button"
              className={`color-swatch color-swatch--text${currentColor === value ? ' is-active' : ''}`}
              style={value ? { '--swatch-color': value } as React.CSSProperties : undefined}
              title={t(label)}
              aria-label={t(label)}
              aria-pressed={currentColor === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyColor(value)}
            >
              {value === null && <Type size={11} strokeWidth={2} />}
            </button>
          ))}
        </div>
      </div>

      <div className="color-palette-divider" />

      <div className="color-palette-section">
        <span className="color-palette-label">{t('format.highlight')}</span>
        <div className="color-palette-swatches">
          {HIGHLIGHT_COLORS.map(({ label, value }) => (
            <button
              key={value ?? 'none'}
              type="button"
              className={`color-swatch color-swatch--highlight${currentHighlight === value ? ' is-active' : ''}`}
              style={value ? { '--swatch-color': value } as React.CSSProperties : undefined}
              title={t(label)}
              aria-label={t(label)}
              aria-pressed={currentHighlight === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyHighlight(value)}
            >
              {value === null && <span className="color-swatch-none" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

interface ToolbarProps {
  editor: Editor
  onOpenLink: () => void
  onOpenImage: () => void
  onOpenSnippets: () => void
}

interface ToolbarButtonProps {
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

function ToolbarButton({
  label,
  shortcut,
  active = false,
  disabled = false,
  onClick,
  children
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={`tool-button${active ? ' is-active' : ''}`}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="toolbar-divider" aria-hidden="true" />
}

const BLOCK_OPTIONS = ['paragraph', '1', '2', '3', '4'] as const

export function Toolbar({ editor, onOpenLink, onOpenImage, onOpenSnippets }: ToolbarProps) {
  const { t, language } = useI18n()
  const [copied, setCopied] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const colorAnchorRef = useRef<HTMLDivElement>(null)
  const colorTriggerRef = useRef<HTMLButtonElement>(null)
  const copyTimer = useRef<number | null>(null)
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const block = current.isActive('heading', { level: 1 })
        ? '1'
        : current.isActive('heading', { level: 2 })
          ? '2'
          : current.isActive('heading', { level: 3 })
            ? '3'
            : current.isActive('heading', { level: 4 })
              ? '4'
              : 'paragraph'

      const cellAttrs = current.isActive('tableHeader')
        ? current.getAttributes('tableHeader')
        : current.getAttributes('tableCell')

      return {
        block,
        bold: current.isActive('bold'),
        italic: current.isActive('italic'),
        underline: current.isActive('underline'),
        strike: current.isActive('strike'),
        code: current.isActive('code'),
        link: current.isActive('link'),
        bulletList: current.isActive('bulletList'),
        orderedList: current.isActive('orderedList'),
        taskList: current.isActive('taskList'),
        blockquote: current.isActive('blockquote'),
        codeBlock: current.isActive('codeBlock'),
        codeLanguage: (current.getAttributes('codeBlock').language as string | null) ?? '',
        alignLeft: current.isActive({ textAlign: 'left' }),
        alignCenter: current.isActive({ textAlign: 'center' }),
        alignRight: current.isActive({ textAlign: 'right' }),
        inTable: current.isActive('table'),
        tableAlign: (cellAttrs.align as string | null) ?? null,
        tableHeader: isTableHeaderEnabled(current),
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
        textColor: (current.getAttributes('textStyle').color as string | undefined) ?? null,
        highlightColor: (current.getAttributes('highlight').color as string | undefined) ?? null,
      }
    }
  })

  const setBlock = (value: string) => {
    if (value === 'paragraph') {
      editor.chain().focus().setParagraph().run()
      return
    }
    editor
      .chain()
      .focus()
      .toggleHeading({ level: Number(value) as 1 | 2 | 3 | 4 })
      .run()
  }

  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    },
    []
  )

  const setCodeLanguage = (value: string) => {
    editor.chain().focus().updateAttributes('codeBlock', { language: value || null }).run()
  }

  const copyCodeBlock = async () => {
    const node = editor.state.selection.$from.parent
    if (node.type.name !== 'codeBlock') return
    try {
      await window.api.writeClipboard(node.textContent)
      setCopied(true)
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  const onToolbarKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const active = document.activeElement
    // Let native selects and text inputs keep their own arrow behaviour.
    if (!(active instanceof HTMLButtonElement) || !toolbarRef.current?.contains(active)) return

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      focusStep(toolbarRef.current, active, 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusStep(toolbarRef.current, active, -1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusEdge(toolbarRef.current, 'first')
    } else if (event.key === 'End') {
      event.preventDefault()
      focusEdge(toolbarRef.current, 'last')
    }
  }

  return (
    <div
      ref={toolbarRef}
      className="toolbar"
      role="toolbar"
      aria-label={t('format.toolbarAria')}
      aria-orientation="horizontal"
      onKeyDown={onToolbarKeyDown}
    >
      <div className="toolbar-row">
        <div className="toolbar-group">
          <ToolbarButton
            label={t('format.undo')}
            shortcut="Ctrl+Z"
            disabled={!state.canUndo}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 size={17} strokeWidth={1.8} />
          </ToolbarButton>
          <ToolbarButton
            label={t('format.redo')}
            shortcut="Ctrl+Y"
            disabled={!state.canRedo}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 size={17} strokeWidth={1.8} />
          </ToolbarButton>
        </div>

        <Divider />

        <div className="toolbar-group">
          <label className="block-select">
            <span className="sr-only">{t('format.paragraphStyle')}</span>
            <select value={state.block} onChange={(event) => setBlock(event.target.value)}>
              {BLOCK_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value === 'paragraph'
                    ? t('format.normalText')
                    : t('format.heading', { level: value })}
                </option>
              ))}
            </select>
            <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
          </label>
        </div>

        <Divider />

        <div className="toolbar-group">
          <ToolbarButton
            label={t('format.bold')}
            shortcut="Ctrl+B"
            active={state.bold}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={17} strokeWidth={2.2} />
          </ToolbarButton>
          <ToolbarButton
            label={t('format.italic')}
            shortcut="Ctrl+I"
            active={state.italic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label={t('format.underline')}
            shortcut="Ctrl+U"
            active={state.underline}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <Underline size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label={t('format.strike')}
            shortcut="Ctrl+Maj+X"
            active={state.strike}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label={t('format.inlineCode')}
            shortcut="Ctrl+E"
            active={state.code}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code size={17} strokeWidth={2} />
          </ToolbarButton>

          {/* Color / highlight picker button */}
          <div ref={colorAnchorRef} className="color-button-wrap">
            <button
              ref={colorTriggerRef}
              type="button"
              className={`tool-button color-tool-button${colorOpen ? ' is-active' : ''}`}
              title={t('format.colorTitle')}
              aria-label={t('format.colorTitle')}
              aria-expanded={colorOpen}
              aria-haspopup="dialog"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setColorOpen((v) => !v)}
            >
              {/* Highlighter icon with color bar underneath */}
              <span className="color-tool-icon">
                <Highlighter size={15} strokeWidth={2} />
                <span
                  className="color-tool-bar"
                  style={
                    state.textColor
                      ? ({ '--bar-color': state.textColor } as React.CSSProperties)
                      : state.highlightColor
                        ? ({ '--bar-color': state.highlightColor } as React.CSSProperties)
                        : undefined
                  }
                />
              </span>
              <ChevronDown size={9} strokeWidth={2.5} className="color-tool-chevron" />
            </button>
            {colorOpen && (
              <ColorPalette
                editor={editor}
                onClose={() => setColorOpen(false)}
                triggerRef={colorTriggerRef}
              />
            )}
          </div>
        </div>

        <Divider />

        <div className="toolbar-group">
          <ToolbarButton
            label={t('format.alignLeft')}
            active={state.alignLeft}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
          >
            <AlignLeft size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label={t('format.alignCenter')}
            active={state.alignCenter}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
          >
            <AlignCenter size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label={t('format.alignRight')}
            active={state.alignRight}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
          >
            <AlignRight size={17} strokeWidth={2} />
          </ToolbarButton>
        </div>

        <Divider />

        <div className="toolbar-group">
          <ToolbarButton
            label={t('format.insertLink')}
            shortcut="Ctrl+K"
            active={state.link}
            onClick={onOpenLink}
          >
            <Link2 size={17} strokeWidth={1.9} />
          </ToolbarButton>
          <ToolbarButton label={t('format.insertImage')} onClick={onOpenImage}>
            <ImagePlus size={17} strokeWidth={1.9} />
          </ToolbarButton>
          <ToolbarButton
            label={t('format.insertFootnote')}
            onClick={() => insertFootnote(editor)}
          >
            <Superscript size={17} strokeWidth={1.9} />
          </ToolbarButton>
          <ToolbarButton label={t('format.insertSnippet')} onClick={onOpenSnippets}>
            <TextCursorInput size={17} strokeWidth={1.9} />
          </ToolbarButton>
        </div>
      </div>

      <div className="toolbar-row toolbar-row--secondary">
        <div className="toolbar-group">
          <ToolbarButton
            label={t('format.bulletList')}
            active={state.bulletList}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label={t('format.orderedList')}
            active={state.orderedList}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label={t('format.taskList')}
            active={state.taskList}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          >
            <ListTodo size={17} strokeWidth={2} />
          </ToolbarButton>
        </div>

        <Divider />

        <div className="toolbar-group">
          <ToolbarButton
            label={t('format.quote')}
            active={state.blockquote}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label={t('format.codeBlock')}
            active={state.codeBlock}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            <Braces size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label={t('format.horizontalRule')}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            <Minus size={17} strokeWidth={2} />
          </ToolbarButton>
        </div>

        <Divider />

        <div className="toolbar-group">
          <ToolbarButton
            label={t('format.insertTable')}
            active={state.inTable}
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            <Table2 size={17} strokeWidth={1.9} />
          </ToolbarButton>
        </div>

        <Divider />

        <div className="toolbar-group">
          <ToolbarButton
            label={t('format.clearFormatting')}
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          >
            <RemoveFormatting size={17} strokeWidth={1.9} />
          </ToolbarButton>
        </div>
      </div>

      {state.codeBlock && (
        <div className="toolbar-row toolbar-row--code">
          <span className="context-bar-label">{t('format.code')}</span>
          <label className="code-language-select">
            <span className="sr-only">{t('format.codeLanguage')}</span>
            <select
              value={state.codeLanguage}
              onChange={(event) => setCodeLanguage(event.target.value)}
            >
              {codeLanguageOptions(state.codeLanguage, language).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
          </label>
          <Divider />
          <div className="toolbar-group">
            <button
              type="button"
              className="text-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void copyCodeBlock()}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? t('format.copied') : t('format.copy')}
            </button>
          </div>
        </div>
      )}

      {state.inTable && (
        <div className="toolbar-row toolbar-row--table">
          <span className="context-bar-label">{t('format.table')}</span>
          <div className="toolbar-group">
            <button
              type="button"
              className="text-button"
              onClick={() => editor.chain().focus().addRowBefore().run()}
            >
              <Rows3 size={15} /> {t('format.rowBefore')}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              <Rows3 size={15} /> {t('format.rowAfter')}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => editor.chain().focus().addColumnBefore().run()}
            >
              <Columns3 size={15} /> {t('format.columnBefore')}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              <Columns3 size={15} /> {t('format.columnAfter')}
            </button>
          </div>
          <Divider />
          <div className="toolbar-group">
            <button
              type="button"
              className={`text-button${state.tableHeader ? ' is-active' : ''}`}
              aria-pressed={state.tableHeader}
              title={t('format.headerTitle')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => toggleTableHeader(editor)}
            >
              <PanelTop size={15} /> {t('format.header')}
            </button>
          </div>
          <Divider />
          <div className="toolbar-group">
            <button
              type="button"
              className={`text-button${state.tableAlign === 'left' ? ' is-active' : ''}`}
              aria-pressed={state.tableAlign === 'left'}
              title={t('format.alignColumnLeft')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setColumnAlignment(editor, 'left')}
            >
              <AlignLeft size={15} /> {t('format.left')}
            </button>
            <button
              type="button"
              className={`text-button${state.tableAlign === 'center' ? ' is-active' : ''}`}
              aria-pressed={state.tableAlign === 'center'}
              title={t('format.alignColumnCenter')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setColumnAlignment(editor, 'center')}
            >
              <AlignCenter size={15} /> {t('format.center')}
            </button>
            <button
              type="button"
              className={`text-button${state.tableAlign === 'right' ? ' is-active' : ''}`}
              aria-pressed={state.tableAlign === 'right'}
              title={t('format.alignColumnRight')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setColumnAlignment(editor, 'right')}
            >
              <AlignRight size={15} /> {t('format.right')}
            </button>
          </div>
          <Divider />
          <div className="toolbar-group">
            <button
              type="button"
              className="text-button"
              onClick={() => editor.chain().focus().deleteRow().run()}
            >
              <Trash2 size={15} /> {t('format.row')}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => editor.chain().focus().deleteColumn().run()}
            >
              <Trash2 size={15} /> {t('format.column')}
            </button>
          </div>
          <Divider />
          <div className="toolbar-group">
            <button
              type="button"
              className="text-button text-button--danger"
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              <Trash2 size={15} /> {t('format.deleteTable')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
