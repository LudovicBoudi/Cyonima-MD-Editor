import { Copy, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { useI18n } from '../lib/i18n'

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
  const { t } = useI18n()
  const isInternal = href.startsWith('#')

  return (
    <div
      className="link-popover"
      style={{ top, left }}
      onMouseDown={(event) => event.stopPropagation()}
      role="dialog"
      aria-label={t('link.aria')}
    >
      <span className="link-popover-url" title={href}>
        {href}
      </span>
      <div className="link-popover-actions">
        <button type="button" onClick={onOpen} title={isInternal ? t('link.anchorTitle') : t('link.openTitle')}>
          <ExternalLink size={14} strokeWidth={2} />
          {isInternal ? t('link.anchor') : t('link.open')}
        </button>
        <button type="button" onClick={onEdit} title={t('link.editTitle')}>
          <Pencil size={14} strokeWidth={2} />
          {t('link.edit')}
        </button>
        <button type="button" onClick={onCopy} title={t('link.copyTitle')}>
          <Copy size={14} strokeWidth={2} />
          {t('link.copy')}
        </button>
        <button type="button" onClick={onRemove} title={t('link.removeTitle')}>
          <Trash2 size={14} strokeWidth={2} />
          {t('link.remove')}
        </button>
      </div>
    </div>
  )
}
