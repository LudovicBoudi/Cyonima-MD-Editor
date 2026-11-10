import { Plus, X } from 'lucide-react'

export interface TabSummary {
  id: string
  name: string
  dirty: boolean
  path: string | null
}

interface TabBarProps {
  tabs: TabSummary[]
  activeId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

/** Document tabs above the editor. Only the active document is edited. */
export function TabBar({ tabs, activeId, onSelect, onClose, onNew }: TabBarProps) {
  return (
    <div className="tab-bar" role="tablist" aria-label="Documents ouverts">
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          <div key={tab.id} className={`tab${active ? ' tab--active' : ''}`}>
            <button
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={active}
              className="tab-select"
              title={tab.path ?? tab.name}
              onClick={() => onSelect(tab.id)}
            >
              {tab.dirty && <span className="tab-dirty" aria-label="Modifications non enregistrées" />}
              <span className="tab-name">{tab.name}</span>
            </button>
            <button
              type="button"
              className="tab-close"
              aria-label={`Fermer ${tab.name}`}
              title="Fermer l’onglet (Ctrl+W)"
              onClick={() => onClose(tab.id)}
            >
              <X size={12} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        className="tab-new"
        aria-label="Nouveau document"
        title="Nouveau document (Ctrl+N)"
        onClick={onNew}
      >
        <Plus size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  )
}
