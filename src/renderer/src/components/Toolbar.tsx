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
import type { ReactNode } from 'react'
import { codeLanguageOptions } from '../editor/codeLanguages'
import { insertFootnote } from '../editor/footnotes'
import {
  isTableHeaderEnabled,
  setColumnAlignment,
  toggleTableHeader
} from '../editor/tableCommands'

// ---------------------------------------------------------------------------
// Color palette — text color and highlight
// ---------------------------------------------------------------------------

const TEXT_COLORS = [
  { label: 'Défaut', value: null },
  { label: 'Rouge', value: '#c0392b' },
  { label: 'Orange', value: '#e67e22' },
  { label: 'Jaune foncé', value: '#d4ac0d' },
  { label: 'Vert', value: '#27ae60' },
  { label: 'Bleu sarcelle', value: '#16a085' },
  { label: 'Bleu', value: '#2980b9' },
  { label: 'Violet', value: '#8e44ad' },
  { label: 'Rose', value: '#e91e8c' },
  { label: 'Gris foncé', value: '#555555' },
  { label: 'Gris', value: '#999999' },
]

const HIGHLIGHT_COLORS = [
  { label: 'Aucun', value: null },
  { label: 'Jaune', value: '#fff176' },
  { label: 'Vert', value: '#b9f6ca' },
  { label: 'Bleu', value: '#b3e5fc' },
  { label: 'Rose', value: '#f8bbd0' },
  { label: 'Violet', value: '#e1bee7' },
  { label: 'Orange', value: '#ffe0b2' },
  { label: 'Gris', value: '#eceff1' },
]

interface ColorPaletteProps {
  editor: Editor
  onClose: () => void
}

function ColorPalette({ editor, onClose }: ColorPaletteProps) {
  const ref = useRef<HTMLDivElement>(null)
  const currentColor = editor.getAttributes('textStyle').color as string | undefined
  const currentHighlight = editor.getAttributes('highlight').color as string | undefined

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

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
    <div ref={ref} className="color-palette" role="dialog" aria-label="Couleurs du texte">
      <div className="color-palette-section">
        <span className="color-palette-label">Couleur du texte</span>
        <div className="color-palette-swatches">
          {TEXT_COLORS.map(({ label, value }) => (
            <button
              key={value ?? 'default'}
              type="button"
              className={`color-swatch color-swatch--text${currentColor === value ? ' is-active' : ''}`}
              style={value ? { '--swatch-color': value } as React.CSSProperties : undefined}
              title={label}
              aria-label={label}
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
        <span className="color-palette-label">Surlignage</span>
        <div className="color-palette-swatches">
          {HIGHLIGHT_COLORS.map(({ label, value }) => (
            <button
              key={value ?? 'none'}
              type="button"
              className={`color-swatch color-swatch--highlight${currentHighlight === value ? ' is-active' : ''}`}
              style={value ? { '--swatch-color': value } as React.CSSProperties : undefined}
              title={label}
              aria-label={label}
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

const BLOCK_OPTIONS = [
  { value: 'paragraph', label: 'Texte normal' },
  { value: '1', label: 'Titre 1' },
  { value: '2', label: 'Titre 2' },
  { value: '3', label: 'Titre 3' },
  { value: '4', label: 'Titre 4' }
] as const

export function Toolbar({ editor, onOpenLink, onOpenImage, onOpenSnippets }: ToolbarProps) {
  const [copied, setCopied] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const colorAnchorRef = useRef<HTMLDivElement>(null)
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

  return (
    <div className="toolbar" role="toolbar" aria-label="Mise en forme">
      <div className="toolbar-row">
        <div className="toolbar-group">
          <ToolbarButton
            label="Annuler"
            shortcut="Ctrl+Z"
            disabled={!state.canUndo}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 size={17} strokeWidth={1.8} />
          </ToolbarButton>
          <ToolbarButton
            label="Rétablir"
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
            <span className="sr-only">Style de paragraphe</span>
            <select value={state.block} onChange={(event) => setBlock(event.target.value)}>
              {BLOCK_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
          </label>
        </div>

        <Divider />

        <div className="toolbar-group">
          <ToolbarButton
            label="Gras"
            shortcut="Ctrl+B"
            active={state.bold}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={17} strokeWidth={2.2} />
          </ToolbarButton>
          <ToolbarButton
            label="Italique"
            shortcut="Ctrl+I"
            active={state.italic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label="Souligné"
            shortcut="Ctrl+U"
            active={state.underline}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <Underline size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label="Barré"
            shortcut="Ctrl+Maj+X"
            active={state.strike}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label="Code en ligne"
            shortcut="Ctrl+E"
            active={state.code}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code size={17} strokeWidth={2} />
          </ToolbarButton>

          {/* Color / highlight picker button */}
          <div ref={colorAnchorRef} className="color-button-wrap">
            <button
              type="button"
              className={`tool-button color-tool-button${colorOpen ? ' is-active' : ''}`}
              title="Couleur du texte et surlignage"
              aria-label="Couleur du texte et surlignage"
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
              <ColorPalette editor={editor} onClose={() => setColorOpen(false)} />
            )}
          </div>
        </div>

        <Divider />

        <div className="toolbar-group">
          <ToolbarButton
            label="Aligner à gauche"
            active={state.alignLeft}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
          >
            <AlignLeft size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label="Centrer"
            active={state.alignCenter}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
          >
            <AlignCenter size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label="Aligner à droite"
            active={state.alignRight}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
          >
            <AlignRight size={17} strokeWidth={2} />
          </ToolbarButton>
        </div>

        <Divider />

        <div className="toolbar-group">
          <ToolbarButton
            label="Insérer un lien"
            shortcut="Ctrl+K"
            active={state.link}
            onClick={onOpenLink}
          >
            <Link2 size={17} strokeWidth={1.9} />
          </ToolbarButton>
          <ToolbarButton label="Insérer une image" onClick={onOpenImage}>
            <ImagePlus size={17} strokeWidth={1.9} />
          </ToolbarButton>
          <ToolbarButton
            label="Insérer une note de bas de page"
            onClick={() => insertFootnote(editor)}
          >
            <Superscript size={17} strokeWidth={1.9} />
          </ToolbarButton>
          <ToolbarButton label="Insérer un extrait ou la date" onClick={onOpenSnippets}>
            <TextCursorInput size={17} strokeWidth={1.9} />
          </ToolbarButton>
        </div>
      </div>

      <div className="toolbar-row toolbar-row--secondary">
        <div className="toolbar-group">
          <ToolbarButton
            label="Liste à puces"
            active={state.bulletList}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label="Liste numérotée"
            active={state.orderedList}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label="Liste de tâches"
            active={state.taskList}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          >
            <ListTodo size={17} strokeWidth={2} />
          </ToolbarButton>
        </div>

        <Divider />

        <div className="toolbar-group">
          <ToolbarButton
            label="Citation"
            active={state.blockquote}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label="Bloc de code"
            active={state.codeBlock}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            <Braces size={17} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label="Séparateur horizontal"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            <Minus size={17} strokeWidth={2} />
          </ToolbarButton>
        </div>

        <Divider />

        <div className="toolbar-group">
          <ToolbarButton
            label="Insérer un tableau"
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
            label="Effacer la mise en forme"
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          >
            <RemoveFormatting size={17} strokeWidth={1.9} />
          </ToolbarButton>
        </div>
      </div>

      {state.codeBlock && (
        <div className="toolbar-row toolbar-row--code">
          <span className="context-bar-label">Code</span>
          <label className="code-language-select">
            <span className="sr-only">Langage du bloc de code</span>
            <select
              value={state.codeLanguage}
              onChange={(event) => setCodeLanguage(event.target.value)}
            >
              {codeLanguageOptions(state.codeLanguage).map((option) => (
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
              {copied ? 'Copié' : 'Copier'}
            </button>
          </div>
        </div>
      )}

      {state.inTable && (
        <div className="toolbar-row toolbar-row--table">
          <span className="context-bar-label">Tableau</span>
          <div className="toolbar-group">
            <button
              type="button"
              className="text-button"
              onClick={() => editor.chain().focus().addRowBefore().run()}
            >
              <Rows3 size={15} /> Ligne avant
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              <Rows3 size={15} /> Ligne après
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => editor.chain().focus().addColumnBefore().run()}
            >
              <Columns3 size={15} /> Colonne avant
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              <Columns3 size={15} /> Colonne après
            </button>
          </div>
          <Divider />
          <div className="toolbar-group">
            <button
              type="button"
              className={`text-button${state.tableHeader ? ' is-active' : ''}`}
              aria-pressed={state.tableHeader}
              title="Activer ou désactiver la ligne d'en-tête"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => toggleTableHeader(editor)}
            >
              <PanelTop size={15} /> En-tête
            </button>
          </div>
          <Divider />
          <div className="toolbar-group">
            <button
              type="button"
              className={`text-button${state.tableAlign === 'left' ? ' is-active' : ''}`}
              aria-pressed={state.tableAlign === 'left'}
              title="Aligner la colonne à gauche"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setColumnAlignment(editor, 'left')}
            >
              <AlignLeft size={15} /> Gauche
            </button>
            <button
              type="button"
              className={`text-button${state.tableAlign === 'center' ? ' is-active' : ''}`}
              aria-pressed={state.tableAlign === 'center'}
              title="Centrer la colonne"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setColumnAlignment(editor, 'center')}
            >
              <AlignCenter size={15} /> Centre
            </button>
            <button
              type="button"
              className={`text-button${state.tableAlign === 'right' ? ' is-active' : ''}`}
              aria-pressed={state.tableAlign === 'right'}
              title="Aligner la colonne à droite"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setColumnAlignment(editor, 'right')}
            >
              <AlignRight size={15} /> Droite
            </button>
          </div>
          <Divider />
          <div className="toolbar-group">
            <button
              type="button"
              className="text-button"
              onClick={() => editor.chain().focus().deleteRow().run()}
            >
              <Trash2 size={15} /> Ligne
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => editor.chain().focus().deleteColumn().run()}
            >
              <Trash2 size={15} /> Colonne
            </button>
          </div>
          <Divider />
          <div className="toolbar-group">
            <button
              type="button"
              className="text-button text-button--danger"
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              <Trash2 size={15} /> Supprimer le tableau
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
