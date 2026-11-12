import { FileText } from 'lucide-react'
import type { PdfExportOptions } from '../../../shared/types'
import type { TranslationKey } from '../../../shared/i18n'
import { useI18n } from '../lib/i18n'
import { Modal } from './Modal'

interface PdfExportDialogProps {
  options: PdfExportOptions
  onChange: (options: PdfExportOptions) => void
  onSubmit: () => void
  onClose: () => void
}

const CHOICES: Array<{
  key: keyof PdfExportOptions
  label: TranslationKey
  hint: TranslationKey
}> = [
  { key: 'header', label: 'pdf.header', hint: 'pdf.headerHint' },
  { key: 'footer', label: 'pdf.footer', hint: 'pdf.footerHint' },
  { key: 'toc', label: 'pdf.toc', hint: 'pdf.tocHint' },
  { key: 'pageBreakBeforeH1', label: 'pdf.pageBreak', hint: 'pdf.pageBreakHint' }
]

export function PdfExportDialog({ options, onChange, onSubmit, onClose }: PdfExportDialogProps) {
  const { t } = useI18n()
  return (
    <Modal
      as="form"
      labelledBy="pdf-title"
      className="pdf-dialog"
      onClose={onClose}
      closeOnBackdrop
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="dialog-heading">
        <span className="dialog-icon">
          <FileText size={18} strokeWidth={1.9} />
        </span>
        <div>
          <h2 id="pdf-title">{t('pdf.title')}</h2>
          <p>{t('pdf.description')}</p>
        </div>
      </div>

      <ul className="pdf-choices">
        {CHOICES.map((choice) => (
          <li key={choice.key}>
            <label className="pdf-choice">
              <input
                type="checkbox"
                checked={options[choice.key]}
                onChange={(event) => onChange({ ...options, [choice.key]: event.target.checked })}
              />
              <span>
                <span className="pdf-choice-label">{t(choice.label)}</span>
                <span className="pdf-choice-hint">{t(choice.hint)}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="dialog-actions">
        <span className="dialog-spacer" />
        <button type="button" className="dialog-button" onClick={onClose}>
          {t('pdf.cancel')}
        </button>
        <button type="submit" className="dialog-button dialog-button--primary">
          {t('pdf.chooseLocation')}
        </button>
      </div>
    </Modal>
  )
}
