import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  ChevronDown,
  Code,
  Columns3,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Redo2,
  Rows3,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
  Undo2,
  ImagePlus,
  RemoveFormatting
} from 'lucide-react'
import type { ReactNode } from 'react'

interface ToolbarProps {
  editor: Editor
  onOpenLink: () => void
  onOpenImage: () => void
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

export function Toolbar({ editor, onOpenLink, onOpenImage }: ToolbarProps) {
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
        alignLeft: current.isActive({ textAlign: 'left' }),
        alignCenter: current.isActive({ textAlign: 'center' }),
        alignRight: current.isActive({ textAlign: 'right' }),
        inTable: current.isActive('table'),
        canUndo: current.can().undo(),
        canRedo: current.can().redo()
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

      {state.inTable && (
        <div className="toolbar-row toolbar-row--table">
          <span className="table-bar-label">Tableau</span>
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
