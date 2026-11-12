import { History } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { HistoryVersion } from '../../../shared/types'
import { useI18n } from '../lib/i18n'
import { Modal } from './Modal'

interface HistoryDialogProps {
  /** Absolute path of the document whose earlier versions are listed. */
  path: string
  onRestore: (content: string) => void
  onClose: () => void
}

function formatSize(bytes: number, t: ReturnType<typeof useI18n>['t']): string {
  if (bytes < 1024) return t('history.sizeBytes', { count: bytes })
  return t('history.sizeKb', { count: Math.round(bytes / 1024) })
}

function formatDate(savedAt: number, locale: string): string {
  return new Date(savedAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Earlier versions of a document, kept each time it was saved. Nothing is
 * written from here: a version opens in a new tab, unsaved, until the user
 * saves it.
 */
export function HistoryDialog({ path, onRestore, onClose }: HistoryDialogProps) {
  const { t, locale } = useI18n()
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

  const selected = versions?.find((version) => version.id === selectedId) ?? null

  return (
    <Modal
      labelledBy="history-title"
      className="dialog--wide history-dialog"
      onClose={onClose}
      closeOnBackdrop
    >
        <div className="dialog-heading">
          <span className="dialog-icon">
            <History size={18} strokeWidth={1.9} />
          </span>
          <div>
            <h2 id="history-title">{t('history.title')}</h2>
            <p>{t('history.description')}</p>
          </div>
        </div>

        {versions === null ? (
          <p className="history-empty">{t('history.loading')}</p>
        ) : versions.length === 0 ? (
          <p className="history-empty">{t('history.empty')}</p>
        ) : (
          <div className="history-layout">
            <ul className="history-list" aria-label={t('history.listAria')}>
              {versions.map((version) => (
                <li key={version.id}>
                  <button
                    type="button"
                    className={`history-item${version.id === selectedId ? ' history-item--active' : ''}`}
                    aria-current={version.id === selectedId ? 'true' : undefined}
                    onClick={() => setSelectedId(version.id)}
                  >
                    <span>{formatDate(version.savedAt, locale)}</span>
                    <span className="history-size">{formatSize(version.size, t)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <pre className="history-preview" aria-label={t('history.previewAria')}>
              {content ?? ''}
            </pre>
          </div>
        )}

        <div className="dialog-actions">
          <span className="dialog-spacer" />
          <button type="button" className="dialog-button" onClick={onClose}>
            {t('history.close')}
          </button>
          <button
            type="button"
            className="dialog-button dialog-button--primary"
            disabled={!selected || content === null}
            onClick={() => {
              if (content !== null) onRestore(content)
            }}
          >
            {t('history.openVersion')}
          </button>
        </div>
    </Modal>
  )
}
