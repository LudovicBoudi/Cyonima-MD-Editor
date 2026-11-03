import { FilePlus2, FolderOpen, Save } from 'lucide-react'

interface AppHeaderProps {
  documentName: string
  dirty: boolean
  onNew: () => void
  onOpen: () => void
  onSave: () => void
}

export function AppHeader({ documentName, dirty, onNew, onOpen, onSave }: AppHeaderProps) {
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
