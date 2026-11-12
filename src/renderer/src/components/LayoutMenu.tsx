import { useEffect, useRef, useState } from 'react'
import { AlignCenter, Check, Focus, LayoutTemplate, Minus, Plus } from 'lucide-react'
import type { PageWidth, ViewSettings } from '../../../shared/types'
import { focusEdge, focusStep } from '../lib/focus'
import {
  DEFAULT_TYPOGRAPHY,
  DOCUMENT_FONT_OPTIONS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  PARAGRAPH_SPACING_MAX,
  PARAGRAPH_SPACING_MIN
} from '../../../shared/typography'

interface LayoutMenuProps {
  settings: ViewSettings
  onChange: (patch: Partial<ViewSettings>) => void
}

export const WIDTHS: Array<{ value: PageWidth; label: string }> = [
  { value: 'narrow', label: 'Étroite' },
  { value: 'normal', label: 'Normale' },
  { value: 'wide', label: 'Large' },
  { value: 'full', label: 'Pleine largeur' }
]

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function clamp(value: number, min: number, max: number): number {
  return round(Math.min(max, Math.max(min, value)))
}

export function LayoutMenu({ settings, onChange }: LayoutMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus()

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

  return (
    <div className="layout-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`header-button${settings.focusMode ? ' is-active' : ''}`}
        onClick={() => setOpen((value) => !value)}
        title="Mise en page et concentration"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <LayoutTemplate size={16} strokeWidth={1.9} />
        <span>Affichage</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="layout-menu-popover"
          role="dialog"
          aria-label="Mise en page et concentration"
        >
          <button
            type="button"
            aria-pressed={settings.focusMode}
            className={`theme-option${settings.focusMode ? ' is-active' : ''}`}
            onClick={() => onChange({ focusMode: !settings.focusMode })}
          >
            <Focus size={15} strokeWidth={1.9} />
            <span>Mode concentration</span>
            {settings.focusMode && <Check size={14} strokeWidth={2.2} className="theme-option-check" />}
          </button>
          <button
            type="button"
            aria-pressed={settings.typewriterMode}
            className={`theme-option${settings.typewriterMode ? ' is-active' : ''}`}
            onClick={() => onChange({ typewriterMode: !settings.typewriterMode })}
          >
            <AlignCenter size={15} strokeWidth={1.9} />
            <span>Machine à écrire</span>
            {settings.typewriterMode && (
              <Check size={14} strokeWidth={2.2} className="theme-option-check" />
            )}
          </button>

          <div className="layout-menu-separator" aria-hidden="true" />

          <span className="layout-menu-label">Largeur de page</span>
          {WIDTHS.map((width) => {
            const active = width.value === settings.pageWidth
            return (
              <button
                key={width.value}
                type="button"
                aria-pressed={active}
                className={`theme-option${active ? ' is-active' : ''}`}
                onClick={() => onChange({ pageWidth: width.value })}
              >
                <span className={`layout-width-glyph layout-width-glyph--${width.value}`} />
                <span>{width.label}</span>
                {active && <Check size={14} strokeWidth={2.2} className="theme-option-check" />}
              </button>
            )
          })}

          <div className="layout-menu-separator" aria-hidden="true" />

          <span className="layout-menu-label">Typographie</span>
          <div className="layout-font-row" role="group" aria-label="Police du document">
            {DOCUMENT_FONT_OPTIONS.map((font) => {
              const active = font.value === settings.fontFamily
              return (
                <button
                  key={font.value}
                  type="button"
                  aria-pressed={active}
                  className={`layout-font-option${active ? ' is-active' : ''}`}
                  onClick={() => onChange({ fontFamily: font.value })}
                >
                  {font.label}
                </button>
              )
            })}
          </div>

          <div className="layout-stepper-row">
            <span className="layout-field-label">Corps</span>
            <div className="layout-stepper">
              <button
                type="button"
                aria-label="Réduire la taille du texte"
                disabled={settings.fontSize <= FONT_SIZE_MIN}
                onClick={() =>
                  onChange({ fontSize: clamp(settings.fontSize - 1, FONT_SIZE_MIN, FONT_SIZE_MAX) })
                }
              >
                <Minus size={13} strokeWidth={2.2} />
              </button>
              <span className="layout-value">{settings.fontSize} px</span>
              <button
                type="button"
                aria-label="Augmenter la taille du texte"
                disabled={settings.fontSize >= FONT_SIZE_MAX}
                onClick={() =>
                  onChange({ fontSize: clamp(settings.fontSize + 1, FONT_SIZE_MIN, FONT_SIZE_MAX) })
                }
              >
                <Plus size={13} strokeWidth={2.2} />
              </button>
            </div>
          </div>

          <div className="layout-stepper-row">
            <span className="layout-field-label">Interligne</span>
            <div className="layout-stepper">
              <button
                type="button"
                aria-label="Réduire l’interligne"
                disabled={settings.lineHeight <= LINE_HEIGHT_MIN}
                onClick={() =>
                  onChange({
                    lineHeight: clamp(
                      settings.lineHeight - 0.05,
                      LINE_HEIGHT_MIN,
                      LINE_HEIGHT_MAX
                    )
                  })
                }
              >
                <Minus size={13} strokeWidth={2.2} />
              </button>
              <span className="layout-value">{settings.lineHeight.toFixed(2)}</span>
              <button
                type="button"
                aria-label="Augmenter l’interligne"
                disabled={settings.lineHeight >= LINE_HEIGHT_MAX}
                onClick={() =>
                  onChange({
                    lineHeight: clamp(
                      settings.lineHeight + 0.05,
                      LINE_HEIGHT_MIN,
                      LINE_HEIGHT_MAX
                    )
                  })
                }
              >
                <Plus size={13} strokeWidth={2.2} />
              </button>
            </div>
          </div>

          <div className="layout-stepper-row">
            <span className="layout-field-label">Paragraphes</span>
            <div className="layout-stepper">
              <button
                type="button"
                aria-label="Réduire l’espacement des paragraphes"
                disabled={settings.paragraphSpacing <= PARAGRAPH_SPACING_MIN}
                onClick={() =>
                  onChange({
                    paragraphSpacing: clamp(
                      settings.paragraphSpacing - 0.05,
                      PARAGRAPH_SPACING_MIN,
                      PARAGRAPH_SPACING_MAX
                    )
                  })
                }
              >
                <Minus size={13} strokeWidth={2.2} />
              </button>
              <span className="layout-value">{settings.paragraphSpacing.toFixed(2)} em</span>
              <button
                type="button"
                aria-label="Augmenter l’espacement des paragraphes"
                disabled={settings.paragraphSpacing >= PARAGRAPH_SPACING_MAX}
                onClick={() =>
                  onChange({
                    paragraphSpacing: clamp(
                      settings.paragraphSpacing + 0.05,
                      PARAGRAPH_SPACING_MIN,
                      PARAGRAPH_SPACING_MAX
                    )
                  })
                }
              >
                <Plus size={13} strokeWidth={2.2} />
              </button>
            </div>
          </div>

          <button
            type="button"
            className="layout-reset"
            onClick={() => onChange(DEFAULT_TYPOGRAPHY)}
          >
            Réinitialiser la typographie
          </button>
        </div>
      )}
    </div>
  )
}
