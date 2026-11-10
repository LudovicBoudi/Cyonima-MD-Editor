import { History } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { HistoryVersion } from '../../../shared/types'

interface HistoryDialogProps {
  /** Absolute path of the document whose earlier versions are listed. */
  path: string
  onRestore: (content: string) => void
  onClose: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  return `${Math.round(bytes / 1024)} Ko`
}

function formatDate(savedAt: number): string {
  return new Date(savedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Earlier versions of a document, kept each time it was saved. Nothing is
 * written from here: a version opens in a new tab, unsaved, until the user
 * saves it.
 */
export function HistoryDialog({ path, onRestore, onClose }: HistoryDialogProps) {
  const [versions, setVersions] = useState<HistoryVersion[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [content, setContent] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void window.api.listHistory(path).then((list) => {
      if (!active) return
      setVersions(list)
      setSelectedId(list[0]?.id ?? null)
    })
    return () => {
      active = false
    }
  }, [path])

  useEffect(() => {
    if (selectedId === null) {
      setContent(null)
      return
    }
    let active = true
    setContent(null)
    void window.api.readHistory(path, selectedId).then((text) => {
      if (active) setContent(text ?? '')
    })
    return () => {
      active = false
    }
  }, [path, selectedId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const selected = versions?.find((version) => version.id === selectedId) ?? null

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog dialog--wide history-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <span className="dialog-icon">
            <History size={18} strokeWidth={1.9} />
          </span>
          <div>
            <h2 id="history-title">Historique des versions</h2>
            <p>
              Chaque enregistrement conserve la version qu’il remplace. Une version s’ouvre dans un
              nouvel onglet ; rien n’est écrit tant que vous n’enregistrez pas.
            </p>
          </div>
        </div>

        {versions === null ? (
          <p className="history-empty">Chargement…</p>
        ) : versions.length === 0 ? (
          <p className="history-empty">
            Aucune version précédente. Une version est conservée à chaque enregistrement qui
            remplace le fichier.
          </p>
        ) : (
          <div className="history-layout">
            <ul className="history-list" aria-label="Versions enregistrées">
              {versions.map((version) => (
                <li key={version.id}>
                  <button
                    type="button"
                    className={`history-item${version.id === selectedId ? ' history-item--active' : ''}`}
                    aria-current={version.id === selectedId ? 'true' : undefined}
                    onClick={() => setSelectedId(version.id)}
                  >
                    <span>{formatDate(version.savedAt)}</span>
                    <span className="history-size">{formatSize(version.size)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <pre className="history-preview" aria-label="Aperçu de la version">
              {content ?? ''}
            </pre>
          </div>
        )}

        <div className="dialog-actions">
          <span className="dialog-spacer" />
          <button type="button" className="dialog-button" onClick={onClose}>
            Fermer
          </button>
          <button
            type="button"
            className="dialog-button dialog-button--primary"
            disabled={!selected || content === null}
            onClick={() => {
              if (content !== null) onRestore(content)
            }}
          >
            Ouvrir cette version
          </button>
        </div>
      </div>
    </div>
  )
}
