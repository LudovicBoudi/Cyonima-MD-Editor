import { Code, FilePlus2, FolderOpen, LayoutTemplate, ListTree, Save } from 'lucide-react'
import type { ThemePreference, ViewSettings } from '../../../shared/types'
import { useI18n } from '../lib/i18n'
import { LayoutMenu } from './LayoutMenu'
import { ThemeMenu } from './ThemeMenu'

interface AppHeaderProps {
  documentName: string
  dirty: boolean
  theme: ThemePreference
  viewSettings: ViewSettings
  sourceMode: boolean
  outlineOpen: boolean
  onToggleOutline: () => void
  onThemeChange: (preference: ThemePreference) => void
  onViewSettingsChange: (patch: Partial<ViewSettings>) => void
  onToggleSource: () => void
  onNew: () => void
  onTemplates: () => void
  onOpen: () => void
  onSave: () => void
}

export function AppHeader({
  documentName,
  dirty,
  theme,
  viewSettings,
  sourceMode,
  outlineOpen,
  onToggleOutline,
  onThemeChange,
  onViewSettingsChange,
  onToggleSource,
  onNew,
  onTemplates,
  onOpen,
  onSave
}: AppHeaderProps) {
  const { t } = useI18n()

  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">C</span>
        <span className="brand-text">
          <strong>Cyonima</strong>
          <span>MD Editor</span>
        </span>
      </div>

      <div className="document-title">
        <span className={`document-name${dirty ? ' is-dirty' : ''}`} title={documentName}>
          {documentName}
        </span>
        {dirty && (
          <>
            <span className="dirty-dot" aria-hidden="true" />
            <span className="sr-only">{t('header.unsaved')}</span>
          </>
        )}
      </div>

      <div className="header-actions" role="group" aria-label={t('header.actions')}>
        <LayoutMenu settings={viewSettings} onChange={onViewSettingsChange} />
        <ThemeMenu preference={theme} onChange={onThemeChange} />
        <button
          type="button"
          className={`header-button${outlineOpen ? ' is-active' : ''}`}
          onClick={onToggleOutline}
          aria-pressed={outlineOpen}
          title={t('header.outlineTitle')}
        >
          <ListTree size={16} strokeWidth={1.9} />
          <span>{t('header.outline')}</span>
        </button>
        <button
          type="button"
          className={`header-button${sourceMode ? ' is-active' : ''}`}
          onClick={onToggleSource}
          aria-pressed={sourceMode}
          title={t('header.sourceTitle')}
        >
          <Code size={16} strokeWidth={1.9} />
          <span>{t('header.source')}</span>
        </button>
        <button type="button" className="header-button" onClick={onTemplates} title={t('header.templatesTitle')}>
          <LayoutTemplate size={16} strokeWidth={1.9} />
          <span>{t('header.templates')}</span>
        </button>
        <button type="button" className="header-button" onClick={onNew} title={t('header.newTitle')}>
          <FilePlus2 size={16} strokeWidth={1.9} />
          <span>{t('header.new')}</span>
        </button>
        <button type="button" className="header-button" onClick={onOpen} title={t('header.openTitle')}>
          <FolderOpen size={16} strokeWidth={1.9} />
          <span>{t('header.open')}</span>
        </button>
        <button
          type="button"
          className="header-button header-button--primary"
          onClick={onSave}
          title={t('header.saveTitle')}
        >
          <Save size={16} strokeWidth={2} />
          <span>{t('header.save')}</span>
        </button>
      </div>
    </header>
  )
}
