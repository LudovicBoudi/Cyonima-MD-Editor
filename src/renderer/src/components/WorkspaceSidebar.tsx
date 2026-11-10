import { ChevronRight, FileText, Folder, FolderOpen, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import type { WorkspaceNode, WorkspaceState } from '../../../shared/types'

interface WorkspaceSidebarProps {
  workspace: WorkspaceState
  activePath: string | null
  onOpenFile: (path: string) => void
  onRefresh: () => void
  onClose: () => void
}

interface TreeProps {
  nodes: WorkspaceNode[]
  depth: number
  activePath: string | null
  collapsed: ReadonlySet<string>
  onToggle: (path: string) => void
  onOpenFile: (path: string) => void
}

function Tree({ nodes, depth, activePath, collapsed, onToggle, onOpenFile }: TreeProps) {
  return (
    <ul className="folder-list" style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      {nodes.map((node) => {
        if (node.kind === 'folder') {
          const open = !collapsed.has(node.path)
          return (
            <li key={node.path}>
              <button
                type="button"
                className="folder-item folder-item--folder"
                aria-expanded={open}
                onClick={() => onToggle(node.path)}
              >
                <ChevronRight
                  className={`folder-chevron${open ? ' folder-chevron--open' : ''}`}
                  size={12}
                  strokeWidth={2}
                  aria-hidden="true"
                />
                {open ? (
                  <FolderOpen size={14} strokeWidth={1.9} aria-hidden="true" />
                ) : (
                  <Folder size={14} strokeWidth={1.9} aria-hidden="true" />
                )}
                <span className="folder-name">{node.name}</span>
              </button>
              {open && node.children && node.children.length > 0 && (
                <Tree
                  nodes={node.children}
                  depth={depth + 1}
                  activePath={activePath}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  onOpenFile={onOpenFile}
                />
              )}
            </li>
          )
        }

        const active = node.path === activePath
        return (
          <li key={node.path}>
            <button
              type="button"
              className={`folder-item folder-item--file${active ? ' folder-item--active' : ''}`}
              aria-current={active ? 'true' : undefined}
              title={node.path}
              onClick={() => onOpenFile(node.path)}
            >
              <FileText size={14} strokeWidth={1.9} aria-hidden="true" />
              <span className="folder-name">{node.name}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Markdown files of the workspace folder. Clicking a file opens it in a tab. */
export function WorkspaceSidebar({
  workspace,
  activePath,
  onOpenFile,
  onRefresh,
  onClose
}: WorkspaceSidebarProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())

  const toggle = (path: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <aside className="folder-panel" aria-label="Dossier de travail">
      <div className="folder-heading">
        <span className="folder-title" title={workspace.root}>
          {workspace.name}
        </span>
        <button
          type="button"
          className="folder-action"
          onClick={onRefresh}
          aria-label="Actualiser le dossier"
          title="Actualiser le dossier"
        >
          <RefreshCw size={13} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="folder-action"
          onClick={onClose}
          aria-label="Fermer le dossier"
          title="Fermer le dossier"
        >
          <X size={13} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {workspace.children.length === 0 ? (
        <p className="folder-empty">Aucun fichier Markdown dans ce dossier.</p>
      ) : (
        <Tree
          nodes={workspace.children}
          depth={0}
          activePath={activePath}
          collapsed={collapsed}
          onToggle={toggle}
          onOpenFile={onOpenFile}
        />
      )}

      {workspace.truncated && (
        <p className="folder-empty">Liste tronquée : le dossier est très volumineux.</p>
      )}
    </aside>
  )
}
