import { X } from 'lucide-react'
import type { OutlineItem } from '../lib/outline'

interface OutlinePanelProps {
  items: OutlineItem[]
  activeIndex: number | null
  onSelect: (pos: number) => void
  onClose: () => void
}

export function OutlinePanel({ items, activeIndex, onSelect, onClose }: OutlinePanelProps) {
  return (
    <nav className="outline-panel" aria-label="Plan du document">
      <div className="outline-heading">
        <span>Plan</span>
        <button
          type="button"
          className="outline-close"
          onClick={onClose}
          title="Masquer le plan"
          aria-label="Masquer le plan"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="outline-empty">Ajoutez des titres pour voir le plan du document.</p>
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
