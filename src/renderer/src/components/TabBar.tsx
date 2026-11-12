import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { useI18n } from '../lib/i18n'

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
  const { t } = useI18n()
  const buttons = useRef(new Map<string, HTMLButtonElement>())

  const focusTab = (id: string) => {
    onSelect(id)
    buttons.current.get(id)?.focus()
  }

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string): void => {
    const index = tabs.findIndex((tab) => tab.id === id)
    if (index < 0) return

    let next = -1
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return

    event.preventDefault()
    const target = tabs[next]
    if (target && target.id !== id) focusTab(target.id)
  }

  return (
    <div
      className="tab-bar"
      role="tablist"
      aria-label={t('tabs.aria')}
      aria-orientation="horizontal"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          <div key={tab.id} className={`tab${active ? ' tab--active' : ''}`}>
            <button
              ref={(node) => {
                if (node) buttons.current.set(tab.id, node)
                else buttons.current.delete(tab.id)
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={active}
              aria-controls="editor-panel"
              tabIndex={active ? 0 : -1}
              className="tab-select"
              title={tab.path ?? tab.name}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => onTabKeyDown(event, tab.id)}
            >
              {tab.dirty && <span className="tab-dirty" aria-hidden="true" />}
              <span className="tab-name">{tab.name}</span>
              {tab.dirty && <span className="sr-only">{t('tabs.unsavedSuffix')}</span>}
            </button>
            <button
              type="button"
              className="tab-close"
              aria-label={t('tabs.close', { name: tab.name })}
              title={t('tabs.closeTitle')}
              tabIndex={active ? 0 : -1}
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
        aria-label={t('tabs.new')}
        title={t('tabs.newTitle')}
        onClick={onNew}
      >
        <Plus size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  )
}
