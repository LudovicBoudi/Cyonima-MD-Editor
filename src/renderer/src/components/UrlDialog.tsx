import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Link2, Unlink } from 'lucide-react'

interface UrlDialogProps {
  mode: 'link' | 'image'
  initialValue?: string
  onSubmit: (value: string) => void
  onRemove?: () => void
  onClose: () => void
}

export function UrlDialog({ mode, initialValue = '', onSubmit, onRemove, onClose }: UrlDialogProps) {
  const [value, setValue] = useState(initialValue)
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

  const isLink = mode === 'link'
  const title = isLink ? 'Insérer un lien' : 'Insérer une image'
  const description = isLink
    ? 'Le texte sélectionné deviendra un lien. Sans sélection, l’adresse sera insérée telle quelle.'
    : 'Collez l’adresse d’une image hébergée en ligne ou un chemin relatif vers un fichier image.'

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form
        className="dialog"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (value.trim()) onSubmit(value)
        }}
      >
        <div className="dialog-heading">
          <span className="dialog-icon">
            {isLink ? <Link2 size={18} strokeWidth={1.9} /> : <ImagePlus size={18} strokeWidth={1.9} />}
          </span>
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        </div>

        <label className="dialog-field">
          <span>{isLink ? 'Adresse du lien' : 'Adresse de l’image'}</span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={isLink ? 'https://exemple.com' : 'https://exemple.com/image.jpg'}
            spellCheck={false}
          />
        </label>

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
