import { useEffect, useState } from 'react'
import type { AppInfo } from '../../../shared/types'
import { useI18n } from '../lib/i18n'
import { Modal } from './Modal'

interface AboutDialogProps {
  onClose: () => void
}

/** Product identity, version and runtime versions. */
export function AboutDialog({ onClose }: AboutDialogProps) {
  const { t } = useI18n()
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    let active = true
    void window.api.getAppInfo().then((value) => {
      if (active) setInfo(value)
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <Modal labelledBy="about-title" className="about-dialog" onClose={onClose} closeOnBackdrop>
      <div className="about-hero">
        <img className="about-icon" src="./icon.png" alt="" width={84} height={84} />
        <div>
          <h2 id="about-title">{t('about.title')}</h2>
          <p className="about-version">
            {info ? t('about.version', { version: info.version }) : '…'}
          </p>
        </div>
      </div>

      <p className="about-description">{t('about.description')}</p>

      {info && (
        <p className="about-runtime">
          {t('about.runtime', {
            electron: info.electron,
            chromium: info.chromium,
            node: info.node
          })}
        </p>
      )}

      <div className="about-footer">
        <span>{t('about.license')}</span>
        <span>{t('about.copyright', { year: new Date().getFullYear() })}</span>
      </div>

      <div className="dialog-actions">
        <span className="dialog-spacer" />
        <button type="button" className="dialog-button dialog-button--primary" onClick={onClose}>
          {t('about.close')}
        </button>
      </div>
    </Modal>
  )
}
