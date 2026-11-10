import { readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { WorkspaceNode, WorkspaceState } from '../shared/types'

/** Extensions shown in the folder tree; other files are hidden. */
export const WORKSPACE_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'txt']

const MAX_DEPTH = 8
const MAX_ENTRIES = 5000

function isMarkdownFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return false
  return WORKSPACE_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase())
}

/** Folders first, then files, each group sorted by name in French order. */
function compareNodes(a: WorkspaceNode, b: WorkspaceNode): number {
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
  return a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' })
}

interface ScanBudget {
  entries: number
  truncated: boolean
}

async function scanFolder(path: string, depth: number, budget: ScanBudget): Promise<WorkspaceNode[]> {
  let entries
  try {
    entries = await readdir(path, { withFileTypes: true })
  } catch {
    // An unreadable folder is shown empty rather than failing the whole tree.
    return []
  }

  const nodes: WorkspaceNode[] = []
  for (const entry of entries) {
    if (budget.entries >= MAX_ENTRIES) {
      budget.truncated = true
      break
    }
    // Hidden folders (.git, .obsidian…) are not documents.
    if (entry.name.startsWith('.')) continue

    const fullPath = join(path, entry.name)
    if (entry.isDirectory()) {
      if (depth >= MAX_DEPTH) {
        budget.truncated = true
        continue
      }
      budget.entries++
      nodes.push({
        kind: 'folder',
        name: entry.name,
        path: fullPath,
        children: await scanFolder(fullPath, depth + 1, budget)
      })
    } else if (entry.isFile() && isMarkdownFile(entry.name)) {
      budget.entries++
      nodes.push({ kind: 'file', name: entry.name, path: fullPath })
    }
  }

  return nodes.sort(compareNodes)
}

/** Reads the Markdown files and folders below `root`. */
export async function scanWorkspace(root: string): Promise<WorkspaceState> {
  const budget: ScanBudget = { entries: 0, truncated: false }
  const children = await scanFolder(root, 1, budget)
  return {
    root,
    name: basename(root) || root,
    children,
    truncated: budget.truncated
  }
}
