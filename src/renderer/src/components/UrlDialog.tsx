import { useEffect, useRef, useState } from 'react'
import { FolderOpen, ImagePlus, Link2, Unlink } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { Modal } from './Modal'

export interface ImageMeta {
  alt: string
  title: string
  width: number | null
}

interface UrlDialogProps {
  mode: 'link' | 'image'
  initialValue?: string
  onSubmit: (value: string, imageMeta?: ImageMeta) => void
  onRemove?: () => void
  onClose: () => void
  /** Only used when mode === 'image'. Opens an OS file picker and returns the chosen path. */
  onBrowse?: () => Promise<string | null>
}

export function UrlDialog({ mode, initialValue = '', onSubmit, onRemove, onClose, onBrowse }: UrlDialogProps) {
  const { t } = useI18n()
  const [value, setValue] = useState(initialValue)
  const [alt, setAlt] = useState('')
  const [title, setTitle] = useState('')
  const [width, setWidth] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleBrowse = async () => {
    if (!onBrowse) return
    const path = await onBrowse()
    if (path) {
      setValue(path)
      inputRef.current?.focus()
    }
  }

  const isLink = mode === 'link'
  const heading = isLink ? t('url.insertLink') : t('url.insertImage')
  const description = isLink ? t('url.linkDescription') : t('url.imageDescription')

  const handleSubmit = () => {
    if (!value.trim()) return
    if (isLink) {
      onSubmit(value)
      return
    }
    const parsedWidth = width.trim() && /^\d+$/.test(width.trim()) ? Number(width.trim()) : null
    onSubmit(value, { alt: alt.trim(), title: title.trim(), width: parsedWidth })
  }

  return (
    <Modal
      as="form"
      labelledBy="url-dialog-title"
      onClose={onClose}
      initialFocus={inputRef}
      onSubmit={(event) => {
        event.preventDefault()
        handleSubmit()
      }}
    >
      <div className="dialog-heading">
        <span className="dialog-icon">
          {isLink ? <Link2 size={18} strokeWidth={1.9} /> : <ImagePlus size={18} strokeWidth={1.9} />}
        </span>
        <div>
          <h2 id="url-dialog-title">{heading}</h2>
          <p>{description}</p>
        </div>
      </div>

      <label className="dialog-field">
        <span>{isLink ? t('url.linkAddress') : t('url.imageAddress')}</span>
        <div className="dialog-field-row">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={isLink ? 'https://exemple.com' : 'https://exemple.com/image.jpg'}
            spellCheck={false}
            data-autofocus
          />
          {!isLink && onBrowse && (
            <button
              type="button"
              className="dialog-button dialog-button--browse"
              onClick={() => void handleBrowse()}
              title={t('url.browseTitle')}
            >
              <FolderOpen size={15} strokeWidth={1.9} />
              {t('common.browse')}
            </button>
          )}
        </div>
      </label>

      {!isLink && (
        <>
          <label className="dialog-field">
            <span>{t('url.alt')}</span>
            <input
              type="text"
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              placeholder={t('url.altPlaceholder')}
              spellCheck={false}
            />
          </label>

          <div className="dialog-field-grid">
            <label className="dialog-field">
              <span>{t('url.caption')}</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('url.captionPlaceholder')}
                spellCheck={false}
              />
            </label>

            <label className="dialog-field">
              <span>{t('url.width')}</span>
              <input
                type="text"
                inputMode="numeric"
                value={width}
                onChange={(event) => setWidth(event.target.value.replace(/[^\d]/g, ''))}
                placeholder={t('url.widthPlaceholder')}
                spellCheck={false}
              />
            </label>
          </div>
        </>
      )}

      <div className="dialog-actions">
        {isLink && onRemove && (
          <button type="button" className="dialog-button dialog-button--danger" onClick={onRemove}>
            <Unlink size={14} strokeWidth={2} />
            {t('url.removeLink')}
          </button>
        )}
        <span className="dialog-spacer" />
        <button type="button" className="dialog-button" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          className="dialog-button dialog-button--primary"
          disabled={!value.trim()}
        >
          {isLink ? t('url.insertLinkAction') : t('url.insertImageAction')}
        </button>
      </div>
    </Modal>
  )
}
