import { useEffect, useRef, useState } from 'react'
import { AlignCenter, Check, Focus, LayoutTemplate, Minus, Plus } from 'lucide-react'
import type { PageWidth, ViewSettings } from '../../../shared/types'
import type { TranslationKey } from '../../../shared/i18n'
import { useI18n } from '../lib/i18n'
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

export const WIDTHS: Array<{ value: PageWidth; label: TranslationKey }> = [
  { value: 'narrow', label: 'layout.width.narrow' },
  { value: 'normal', label: 'layout.width.normal' },
  { value: 'wide', label: 'layout.width.wide' },
  { value: 'full', label: 'layout.width.full' }
]

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function clamp(value: number, min: number, max: number): number {
  return round(Math.min(max, Math.max(min, value)))
}

export function LayoutMenu({ settings, onChange }: LayoutMenuProps) {
  const { t } = useI18n()
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
        title={t('layout.triggerTitle')}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <LayoutTemplate size={16} strokeWidth={1.9} />
        <span>{t('layout.trigger')}</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="layout-menu-popover"
          role="dialog"
          aria-label={t('layout.aria')}
        >
          <button
            type="button"
            aria-pressed={settings.focusMode}
            className={`theme-option${settings.focusMode ? ' is-active' : ''}`}
            onClick={() => onChange({ focusMode: !settings.focusMode })}
          >
            <Focus size={15} strokeWidth={1.9} />
            <span>{t('layout.focusMode')}</span>
            {settings.focusMode && <Check size={14} strokeWidth={2.2} className="theme-option-check" />}
          </button>
          <button
            type="button"
            aria-pressed={settings.typewriterMode}
            className={`theme-option${settings.typewriterMode ? ' is-active' : ''}`}
            onClick={() => onChange({ typewriterMode: !settings.typewriterMode })}
          >
            <AlignCenter size={15} strokeWidth={1.9} />
            <span>{t('layout.typewriter')}</span>
            {settings.typewriterMode && (
              <Check size={14} strokeWidth={2.2} className="theme-option-check" />
            )}
          </button>

          <div className="layout-menu-separator" aria-hidden="true" />

          <span className="layout-menu-label">{t('layout.pageWidth')}</span>
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
                <span>{t(width.label)}</span>
                {active && <Check size={14} strokeWidth={2.2} className="theme-option-check" />}
              </button>
            )
          })}

          <div className="layout-menu-separator" aria-hidden="true" />

          <span className="layout-menu-label">{t('layout.typography')}</span>
          <div className="layout-font-row" role="group" aria-label={t('layout.fontAria')}>
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
            <span className="layout-field-label">{t('layout.body')}</span>
            <div className="layout-stepper">
              <button
                type="button"
                aria-label={t('layout.decreaseFont')}
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
                aria-label={t('layout.increaseFont')}
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
            <span className="layout-field-label">{t('layout.lineHeight')}</span>
            <div className="layout-stepper">
              <button
                type="button"
                aria-label={t('layout.decreaseLineHeight')}
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
                aria-label={t('layout.increaseLineHeight')}
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
            <span className="layout-field-label">{t('layout.paragraphs')}</span>
            <div className="layout-stepper">
              <button
                type="button"
                aria-label={t('layout.decreaseParagraphSpacing')}
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
                aria-label={t('layout.increaseParagraphSpacing')}
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
            {t('layout.reset')}
          </button>
        </div>
      )}
    </div>
  )
}
