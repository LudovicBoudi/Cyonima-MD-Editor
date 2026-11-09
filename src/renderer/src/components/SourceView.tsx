import { AlertTriangle, Code } from 'lucide-react'
import { useEffect } from 'react'

interface SourceViewProps {
  value: string
  onChange: (value: string) => void
}

/**
 * Plain Markdown editing. The text is the document itself: nothing is
 * normalised until the user goes back to the WYSIWYG view.
 */
export function SourceView({ value, onChange }: SourceViewProps) {
  return (
    <textarea
      className="source-view"
      aria-label="Source Markdown"
      spellCheck={false}
      autoFocus
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

interface SourceExitDialogProps {
  tags: string[]
  onStay: () => void
  onProceed: () => void
}

export function SourceExitDialog({ tags, onStay, onProceed }: SourceExitDialogProps) {
  const list = tags.map((tag) => `<${tag}>`).join(', ')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onStay()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onStay])

  return (
    <div className="dialog-backdrop" onMouseDown={onStay}>
      <div
        className="dialog"
        role="alertdialog"
        aria-labelledby="source-exit-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <span className="dialog-icon">
            <AlertTriangle size={18} strokeWidth={1.9} />
          </span>
          <div>
            <h2 id="source-exit-title">Balises HTML non représentées</h2>
            <p>
              L’éditeur ne sait pas afficher {list}. Leur texte sera conservé, mais leur mise en
              forme sera perdue à la prochaine sauvegarde depuis l’éditeur.
            </p>
          </div>
        </div>

        <div className="dialog-actions">
          <button type="button" className="dialog-button dialog-button--primary" onClick={onStay}>
            <Code size={14} strokeWidth={2} aria-hidden="true" />
            Rester dans la source
          </button>
          <button type="button" className="dialog-button dialog-button--danger" onClick={onProceed}>
            Passer à l’éditeur quand même
          </button>
        </div>
      </div>
    </div>
  )
}
