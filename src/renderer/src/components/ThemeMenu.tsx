import { useEffect, useRef, useState } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import type { ThemePreference } from '../../../shared/types'
import type { TranslationKey } from '../../../shared/i18n'
import { useI18n } from '../lib/i18n'
import { focusEdge, focusStep } from '../lib/focus'

interface ThemeMenuProps {
  preference: ThemePreference
  onChange: (preference: ThemePreference) => void
}

const OPTIONS: Array<{
  value: ThemePreference
  label: TranslationKey
  icon: typeof Sun
}> = [
  { value: 'light', label: 'theme.light', icon: Sun },
  { value: 'dark', label: 'theme.dark', icon: Moon },
  { value: 'system', label: 'theme.system', icon: Monitor }
]

export function ThemeMenu({ preference, onChange }: ThemeMenuProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const selected = panelRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
    ;(selected ?? panelRef.current?.querySelector<HTMLButtonElement>('button'))?.focus()

    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
        return
      }

      if (
        event.key !== 'ArrowDown' &&
        event.key !== 'ArrowUp' &&
        event.key !== 'Home' &&
        event.key !== 'End'
      ) {
        return
      }

      const active = document.activeElement
      if (!panelRef.current?.contains(active)) return
      event.preventDefault()
      if (event.key === 'Home') focusEdge(panelRef.current, 'first')
      else if (event.key === 'End') focusEdge(panelRef.current, 'last')
      else focusStep(panelRef.current, active, event.key === 'ArrowDown' ? 1 : -1)
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const current = OPTIONS.find((option) => option.value === preference) ?? OPTIONS[2]
  const CurrentIcon = current.icon

  return (
    <div className="theme-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="header-button"
        onClick={() => setOpen((value) => !value)}
        title={t('theme.title', { name: t(current.label) })}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <CurrentIcon size={16} strokeWidth={1.9} />
        <span>{t(current.label)}</span>
      </button>

      {open && (
        <div ref={panelRef} className="theme-menu-popover" role="menu" aria-label={t('theme.aria')}>
          {OPTIONS.map((option) => {
            const Icon = option.icon
            const active = option.value === preference
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={`theme-option${active ? ' is-active' : ''}`}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                  triggerRef.current?.focus()
                }}
              >
                <Icon size={15} strokeWidth={1.9} />
                <span>{t(option.label)}</span>
                {active && <Check size={14} strokeWidth={2.2} className="theme-option-check" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
