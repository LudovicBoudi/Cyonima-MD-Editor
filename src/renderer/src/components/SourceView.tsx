import { AlertTriangle, Code } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { Modal } from './Modal'

interface SourceViewProps {
  value: string
  onChange: (value: string) => void
}

/**
 * Plain Markdown editing. The text is the document itself: nothing is
 * normalised until the user goes back to the WYSIWYG view.
 */
export function SourceView({ value, onChange }: SourceViewProps) {
  const { t } = useI18n()
  return (
    <textarea
      className="source-view"
      aria-label={t('source.aria')}
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
  const { t } = useI18n()
  const list = tags.map((tag) => `<${tag}>`).join(', ')

  return (
    <Modal
      role="alertdialog"
      labelledBy="source-exit-title"
      onClose={onStay}
      closeOnBackdrop
    >
        <div className="dialog-heading">
          <span className="dialog-icon">
            <AlertTriangle size={18} strokeWidth={1.9} />
          </span>
          <div>
            <h2 id="source-exit-title">{t('source.exit.title')}</h2>
            <p>{t('source.exit.description', { tags: list })}</p>
          </div>
        </div>

        <div className="dialog-actions">
          <button type="button" className="dialog-button dialog-button--primary" onClick={onStay}>
            <Code size={14} strokeWidth={2} aria-hidden="true" />
            {t('source.exit.stay')}
          </button>
          <button type="button" className="dialog-button dialog-button--danger" onClick={onProceed}>
            {t('source.exit.proceed')}
          </button>
        </div>
    </Modal>
  )
}
