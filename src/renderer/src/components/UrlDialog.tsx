import { useEffect, useRef, useState } from 'react'
import { FolderOpen, ImagePlus, Link2, Unlink } from 'lucide-react'

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
  const [value, setValue] = useState(initialValue)
  const [alt, setAlt] = useState('')
  const [title, setTitle] = useState('')
  const [width, setWidth] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handleBrowse = async () => {
    if (!onBrowse) return
    const path = await onBrowse()
    if (path) {
      setValue(path)
      inputRef.current?.focus()
    }
  }

  const isLink = mode === 'link'
  const heading = isLink ? 'Insérer un lien' : 'Insérer une image'
  const description = isLink
    ? 'Le texte sélectionné deviendra un lien. Sans sélection, l’adresse sera insérée telle quelle.'
    : 'Collez l’adresse d’une image en ligne, un chemin relatif, ou parcourez vos fichiers locaux.'

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
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form
        className="dialog"
        onMouseDown={(event) => event.stopPropagation()}
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
            <h2>{heading}</h2>
            <p>{description}</p>
          </div>
        </div>

        <label className="dialog-field">
          <span>{isLink ? 'Adresse du lien' : 'Adresse de l’image'}</span>
          <div className="dialog-field-row">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={isLink ? 'https://exemple.com' : 'https://exemple.com/image.jpg'}
              spellCheck={false}
            />
            {!isLink && onBrowse && (
              <button
                type="button"
                className="dialog-button dialog-button--browse"
                onClick={() => void handleBrowse()}
                title="Parcourir les fichiers locaux"
              >
                <FolderOpen size={15} strokeWidth={1.9} />
                Parcourir…
              </button>
            )}
          </div>
        </label>

        {!isLink && (
          <>
            <label className="dialog-field">
              <span>Texte alternatif (alt)</span>
              <input
                type="text"
                value={alt}
                onChange={(event) => setAlt(event.target.value)}
                placeholder="Description de l’image"
                spellCheck={false}
              />
            </label>

            <div className="dialog-field-grid">
              <label className="dialog-field">
                <span>Légende (titre)</span>
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Légende affichée au survol"
                  spellCheck={false}
                />
              </label>

              <label className="dialog-field">
                <span>Largeur (px, optionnel)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={width}
                  onChange={(event) => setWidth(event.target.value.replace(/[^\d]/g, ''))}
                  placeholder="Auto"
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
              Retirer le lien
            </button>
          )}
          <span className="dialog-spacer" />
          <button type="button" className="dialog-button" onClick={onClose}>
            Annuler
          </button>
          <button
            type="submit"
            className="dialog-button dialog-button--primary"
            disabled={!value.trim()}
          >
            {isLink ? 'Insérer le lien' : 'Insérer l’image'}
          </button>
        </div>
      </form>
    </div>
  )
}
