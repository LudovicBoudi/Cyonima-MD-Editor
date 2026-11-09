import { Code, FilePlus2, FolderOpen, LayoutTemplate, ListTree, Save } from 'lucide-react'
import type { ThemePreference, ViewSettings } from '../../../shared/types'
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
  return (
    <header className="app-header">
      <div className="brand" aria-label="Cyonima MD Editor">
        <span className="brand-mark">C</span>
        <span className="brand-text">
          <strong>Cyonima</strong>
          <span>MD Editor</span>
        </span>
      </div>

      <div className="document-title">
        <span className={`document-name${dirty ? ' is-dirty' : ''}`} title={documentName}>
          {documentName}
        </span>
        {dirty && <span className="dirty-dot" title="Modifications non enregistrées" />}
      </div>

      <div className="header-actions">
        <LayoutMenu settings={viewSettings} onChange={onViewSettingsChange} />
        <ThemeMenu preference={theme} onChange={onThemeChange} />
        <button
          type="button"
          className={`header-button${outlineOpen ? ' is-active' : ''}`}
          onClick={onToggleOutline}
          aria-pressed={outlineOpen}
          title="Afficher le plan du document"
        >
          <ListTree size={16} strokeWidth={1.9} />
          <span>Plan</span>
        </button>
        <button
          type="button"
          className={`header-button${sourceMode ? ' is-active' : ''}`}
          onClick={onToggleSource}
          aria-pressed={sourceMode}
          title="Source Markdown (Ctrl+Maj+M)"
        >
          <Code size={16} strokeWidth={1.9} />
          <span>Source</span>
        </button>
        <button type="button" className="header-button" onClick={onTemplates} title="Nouveau document à partir d’un modèle">
          <LayoutTemplate size={16} strokeWidth={1.9} />
          <span>Modèles</span>
        </button>
        <button type="button" className="header-button" onClick={onNew} title="Nouveau document (Ctrl+N)">
          <FilePlus2 size={16} strokeWidth={1.9} />
          <span>Nouveau</span>
        </button>
        <button type="button" className="header-button" onClick={onOpen} title="Ouvrir un document (Ctrl+O)">
          <FolderOpen size={16} strokeWidth={1.9} />
          <span>Ouvrir</span>
        </button>
        <button
          type="button"
          className="header-button header-button--primary"
          onClick={onSave}
          title="Enregistrer (Ctrl+S)"
        >
          <Save size={16} strokeWidth={2} />
          <span>Enregistrer</span>
        </button>
      </div>
    </header>
  )
}
