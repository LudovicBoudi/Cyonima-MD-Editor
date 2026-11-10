import { ChevronDown, Pencil } from 'lucide-react'
import { checkFrontmatterYaml } from '../editor/frontmatter'

interface FrontmatterPanelProps {
  /** Current block with its fences, or `null` when the document has none. */
  value: string | null
  /** YAML text being edited, or `null` when the panel only displays. */
  draft: string | null
  onEdit: () => void
  onDraftChange: (draft: string) => void
  /** Receives the YAML text. Blank text removes the frontmatter. */
  onSave: (yaml: string) => void
  onCancel: () => void
  onDelete: () => void
}

/**
 * Frontmatter is metadata, not document content: it is kept out of the
 * ProseMirror document. It is displayed read-only by default; editing works on
 * the YAML text only, so untouched lines are written back byte for byte.
 */
export function FrontmatterPanel({
  value,
  draft,
  onEdit,
  onDraftChange,
  onSave,
  onCancel,
  onDelete
}: FrontmatterPanelProps) {
  if (draft !== null) {
    const check = checkFrontmatterYaml(draft)
    const message = check.ok ? null : check.message

    return (
      <section className="frontmatter-panel frontmatter-panel--editing" aria-label="Modifier les métadonnées">
        <div className="frontmatter-edit-head">
          <span className="frontmatter-title">
            {value ? 'Modifier les métadonnées YAML' : 'Ajouter des métadonnées YAML'}
          </span>
        </div>
        <textarea
          className="frontmatter-input"
          value={draft}
          spellCheck={false}
          aria-invalid={message !== null}
          aria-describedby={message ? 'frontmatter-error' : undefined}
          rows={Math.min(14, Math.max(4, draft.split('\n').length + 1))}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
            } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && check.ok) {
              event.preventDefault()
              onSave(draft)
            }
          }}
        />
        {message && (
          <p id="frontmatter-error" className="frontmatter-error" role="alert">
            {message}
          </p>
        )}
        <div className="frontmatter-actions">
          {value && (
            <button type="button" className="dialog-button dialog-button--danger" onClick={onDelete}>
              Supprimer les métadonnées
            </button>
          )}
          <span className="dialog-spacer" />
          <button type="button" className="dialog-button" onClick={onCancel}>
            Annuler
          </button>
          <button
            type="button"
            className="dialog-button dialog-button--primary"
            disabled={message !== null}
            onClick={() => onSave(draft)}
          >
            Enregistrer
          </button>
        </div>
      </section>
    )
  }

  if (value === null) return null

  const body = value.replace(/^\uFEFF?---[ \t]*\r?\n/, '').replace(/\r?\n(?:---|\.\.\.)[ \t]*$/, '')
  const lineCount = body.split(/\r?\n/).length

  return (
    <details className="frontmatter-panel">
      <summary
        className="frontmatter-summary"
        title="Métadonnées du document, conservées telles quelles à l’enregistrement"
      >
        <ChevronDown className="frontmatter-chevron" size={14} strokeWidth={2} aria-hidden="true" />
        <span className="frontmatter-title">Métadonnées YAML</span>
        <span className="frontmatter-meta">
          {lineCount} ligne{lineCount > 1 ? 's' : ''}
        </span>
      </summary>
      <pre className="frontmatter-code">
        <code>{value}</code>
      </pre>
      <div className="frontmatter-actions">
        <button type="button" className="dialog-button" onClick={onEdit}>
          <Pencil size={13} strokeWidth={2} aria-hidden="true" />
          Modifier…
        </button>
      </div>
    </details>
  )
}
