import { Check, CircleAlert, FileText } from 'lucide-react'
import type { FileFormat } from '../../../shared/types'

interface StatusBarProps {
  words: number
  characters: number
  documentPath: string | null
  dirty: boolean
  justSaved: boolean
  format: FileFormat
}

const ENCODING_LABELS: Record<FileFormat['encoding'], string> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE'
}

export function StatusBar({
  words,
  characters,
  documentPath,
  dirty,
  justSaved,
  format
}: StatusBarProps) {
  const readingMinutes = Math.max(1, Math.ceil(words / 200))
  const formatLabel = `${ENCODING_LABELS[format.encoding]}${format.bom ? ' BOM' : ''} · ${format.eol.toUpperCase()}`

  return (
    <footer className="status-bar">
      <div className="status-left">
        {dirty ? (
          <span className="status-item status-item--warning">
            <CircleAlert size={13} strokeWidth={2} />
            Modifications non enregistrées
          </span>
        ) : justSaved ? (
          <span className="status-item status-item--success">
            <Check size={13} strokeWidth={2.2} />
            Enregistré
          </span>
        ) : (
          <span className="status-item">
            <Check size={13} strokeWidth={2.2} />
            Prêt
          </span>
        )}
        <span className="status-divider" />
        <span className="status-item status-path" title={documentPath ?? 'Document non enregistré'}>
          <FileText size={13} strokeWidth={1.8} />
          {documentPath ?? 'Brouillon non enregistré'}
        </span>
      </div>

      <div className="status-right">
        <span className="status-item">
          {words.toLocaleString('fr-FR')} mot{words > 1 ? 's' : ''}
        </span>
        <span className="status-divider" />
        <span className="status-item">
          {characters.toLocaleString('fr-FR')} caractère{characters > 1 ? 's' : ''}
        </span>
        <span className="status-divider" />
        <span className="status-item">~{readingMinutes} min de lecture</span>
        <span className="status-divider" />
        <span
          className="status-item"
          title="Encodage et fins de ligne qui seront utilisés à l’enregistrement"
        >
          {formatLabel}
        </span>
        <span className="status-divider" />
        <span className="status-badge">Markdown</span>
      </div>
    </footer>
  )
}
