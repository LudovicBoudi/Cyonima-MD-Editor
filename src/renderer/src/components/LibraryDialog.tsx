import { FolderOpen, LayoutTemplate, TextCursorInput } from 'lucide-react'
import type { LibraryEntry } from '../../../shared/types'
import { libraryPreview } from '../lib/libraryPreview'
import { Modal } from './Modal'

interface LibraryDialogProps {
  mode: 'templates' | 'snippets'
  entries: LibraryEntry[]
  folder: string
  onPick: (entry: LibraryEntry) => void
  onOpenFolder: () => void
  onClose: () => void
}

const COPY = {
  templates: {
    title: 'Modèles de document',
    description: 'Crée un nouveau document à partir du modèle choisi.',
    empty: 'Aucun modèle. Ajoutez un fichier .md au dossier des modèles.'
  },
  snippets: {
    title: 'Extraits',
    description: 'Insère l’extrait à la position du curseur.',
    empty: 'Aucun extrait. Ajoutez un fichier .md au dossier des extraits.'
  }
} as const

export function LibraryDialog({ mode, entries, folder, onPick, onOpenFolder, onClose }: LibraryDialogProps) {
  const copy = COPY[mode]
  const Icon = mode === 'templates' ? LayoutTemplate : TextCursorInput

  return (
    <Modal
      labelledBy="library-title"
      className="library-dialog"
      onClose={onClose}
      closeOnBackdrop
    >
        <div className="dialog-heading">
          <span className="dialog-icon">
            <Icon size={18} strokeWidth={1.9} />
          </span>
          <div>
            <h2 id="library-title">{copy.title}</h2>
            <p>{copy.description}</p>
          </div>
        </div>

        {entries.length === 0 ? (
          <p className="library-empty">{copy.empty}</p>
        ) : (
          <ul className="library-list">
            {entries.map((entry) => (
              <li key={entry.name}>
                <button type="button" className="library-item" onClick={() => onPick(entry)}>
                  <span className="library-name">{entry.name}</span>
                  <span className="library-preview">{libraryPreview(entry.content)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="dialog-actions">
          <button
            type="button"
            className="dialog-button"
            onClick={onOpenFolder}
            title={folder}
          >
            <FolderOpen size={14} strokeWidth={2} aria-hidden="true" />
            Ouvrir le dossier
          </button>
          <button type="button" className="dialog-button dialog-button--primary" onClick={onClose}>
            Fermer
          </button>
        </div>
    </Modal>
  )
}
