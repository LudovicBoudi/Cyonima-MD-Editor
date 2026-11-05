import { Copy, ExternalLink, Pencil, Trash2 } from 'lucide-react'

interface LinkPopoverProps {
  href: string
  top: number
  left: number
  onOpen: () => void
  onEdit: () => void
  onCopy: () => void
  onRemove: () => void
}

/**
 * Floating actions for a clicked link. A plain click now does something useful
 * instead of appearing broken: open, edit, copy or remove the link.
 */
export function LinkPopover({ href, top, left, onOpen, onEdit, onCopy, onRemove }: LinkPopoverProps) {
  const isInternal = href.startsWith('#')

  return (
    <div
      className="link-popover"
      style={{ top, left }}
      onMouseDown={(event) => event.stopPropagation()}
      role="dialog"
      aria-label="Actions sur le lien"
    >
      <span className="link-popover-url" title={href}>
        {href}
      </span>
      <div className="link-popover-actions">
        <button type="button" onClick={onOpen} title={isInternal ? 'Aller à l’ancre' : 'Ouvrir le lien'}>
          <ExternalLink size={14} strokeWidth={2} />
          {isInternal ? 'Ancre' : 'Ouvrir'}
        </button>
        <button type="button" onClick={onEdit} title="Modifier le lien">
          <Pencil size={14} strokeWidth={2} />
          Modifier
        </button>
        <button type="button" onClick={onCopy} title="Copier l’adresse">
          <Copy size={14} strokeWidth={2} />
          Copier
        </button>
        <button type="button" onClick={onRemove} title="Supprimer le lien">
          <Trash2 size={14} strokeWidth={2} />
          Supprimer
        </button>
      </div>
    </div>
  )
}
