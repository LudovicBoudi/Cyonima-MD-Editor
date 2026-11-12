import { FolderOpen, LayoutTemplate, TextCursorInput } from 'lucide-react'
import type { LibraryEntry } from '../../../shared/types'
import { libraryPreview } from '../lib/libraryPreview'
import type { TranslationKey } from '../../../shared/i18n'
import { useI18n } from '../lib/i18n'
import { Modal } from './Modal'

interface LibraryDialogProps {
  mode: 'templates' | 'snippets'
  entries: LibraryEntry[]
  folder: string
  onPick: (entry: LibraryEntry) => void
  onOpenFolder: () => void
  onClose: () => void
}

const COPY: Record<
  'templates' | 'snippets',
  { title: TranslationKey; description: TranslationKey; empty: TranslationKey }
> = {
  templates: {
    title: 'library.templates.title',
    description: 'library.templates.description',
    empty: 'library.templates.empty'
  },
  snippets: {
    title: 'library.snippets.title',
    description: 'library.snippets.description',
    empty: 'library.snippets.empty'
  }
}

export function LibraryDialog({ mode, entries, folder, onPick, onOpenFolder, onClose }: LibraryDialogProps) {
  const { t } = useI18n()
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
            <h2 id="library-title">{t(copy.title)}</h2>
            <p>{t(copy.description)}</p>
          </div>
        </div>

        {entries.length === 0 ? (
          <p className="library-empty">{t(copy.empty)}</p>
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
            {t('library.openFolder')}
          </button>
          <button type="button" className="dialog-button dialog-button--primary" onClick={onClose}>
            {t('library.close')}
          </button>
        </div>
    </Modal>
  )
}
