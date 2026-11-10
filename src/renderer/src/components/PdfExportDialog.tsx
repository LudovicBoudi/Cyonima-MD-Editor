import { FileText } from 'lucide-react'
import { useEffect } from 'react'
import type { PdfExportOptions } from '../../../shared/types'

interface PdfExportDialogProps {
  options: PdfExportOptions
  onChange: (options: PdfExportOptions) => void
  onSubmit: () => void
  onClose: () => void
}

const CHOICES: Array<{ key: keyof PdfExportOptions; label: string; hint: string }> = [
  {
    key: 'header',
    label: 'En-tête avec le titre',
    hint: 'Affiche le titre du document en haut de chaque page.'
  },
  {
    key: 'footer',
    label: 'Numéros de page',
    hint: 'Affiche « Page X sur Y » en bas de chaque page.'
  },
  {
    key: 'toc',
    label: 'Table des matières',
    hint: 'Ajoute une liste cliquable des titres avant le document.'
  },
  {
    key: 'pageBreakBeforeH1',
    label: 'Saut de page avant chaque titre de niveau 1',
    hint: 'Chaque grande partie commence sur une nouvelle page.'
  }
]

export function PdfExportDialog({ options, onChange, onSubmit, onClose }: PdfExportDialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form
        className="dialog pdf-dialog"
        role="dialog"
        aria-labelledby="pdf-title"
        onMouseDown={(event) => event.stopPropagation()}
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
            <h2 id="pdf-title">Exporter en PDF</h2>
            <p>Format A4 avec les typographies de l’éditeur. Les images locales sont incluses.</p>
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
                  <span className="pdf-choice-label">{choice.label}</span>
                  <span className="pdf-choice-hint">{choice.hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <div className="dialog-actions">
          <span className="dialog-spacer" />
          <button type="button" className="dialog-button" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="dialog-button dialog-button--primary">
            Choisir l’emplacement…
          </button>
        </div>
      </form>
    </div>
  )
}
