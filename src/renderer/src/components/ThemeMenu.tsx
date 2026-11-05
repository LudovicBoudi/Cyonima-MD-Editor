import { useEffect, useRef, useState } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import type { ThemePreference } from '../../../shared/types'

interface ThemeMenuProps {
  preference: ThemePreference
  onChange: (preference: ThemePreference) => void
}

const OPTIONS: Array<{
  value: ThemePreference
  label: string
  icon: typeof Sun
}> = [
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon },
  { value: 'system', label: 'Automatique', icon: Monitor }
]

export function ThemeMenu({ preference, onChange }: ThemeMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
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
        type="button"
        className="header-button"
        onClick={() => setOpen((value) => !value)}
        title={`Thème : ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <CurrentIcon size={16} strokeWidth={1.9} />
        <span>{current.label}</span>
      </button>

      {open && (
        <div className="theme-menu-popover" role="menu" aria-label="Choisir un thème">
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
                }}
              >
                <Icon size={15} strokeWidth={1.9} />
                <span>{option.label}</span>
                {active && <Check size={14} strokeWidth={2.2} className="theme-option-check" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
