import { X } from 'lucide-react'
import type { OutlineItem } from '../lib/outline'
import { useI18n } from '../lib/i18n'

interface OutlinePanelProps {
  items: OutlineItem[]
  activeIndex: number | null
  onSelect: (pos: number) => void
  onClose: () => void
}

export function OutlinePanel({ items, activeIndex, onSelect, onClose }: OutlinePanelProps) {
  const { t } = useI18n()
  return (
    <nav className="outline-panel" aria-label={t('outline.aria')}>
      <div className="outline-heading">
        <span>{t('outline.title')}</span>
        <button
          type="button"
          className="outline-close"
          onClick={onClose}
          title={t('outline.hide')}
          aria-label={t('outline.hide')}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="outline-empty">{t('outline.empty')}</p>
      ) : (
        <ul className="outline-list">
          {items.map((item, index) => (
            <li key={item.pos}>
              <button
                type="button"
                className={`outline-item outline-item--${item.level}${index === activeIndex ? ' is-active' : ''}`}
                title={item.text}
                aria-current={index === activeIndex ? 'location' : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelect(item.pos)}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}
