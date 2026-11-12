import type { JSONContent } from '@tiptap/core'
import type { FileFormat } from '../../../shared/types'
import { splitFrontmatter } from '../editor/markdown'

/**
 * Everything needed to bring an inactive document back as it was. Only one
 * editor exists: the active tab lives in the workspace state, the others are
 * kept here.
 */
export interface TabSnapshot {
  id: string
  path: string | null
  name: string
  format: FileFormat
  frontmatter: string | null
  frontmatterDraft: string | null
  dirty: boolean
  /** Markdown as last known, frontmatter included, when no editor JSON is kept. */
  markdown: string
  /** Editor HTML kept for autosave and for HTML drafts. `null` means parse `markdown`. */
  html: string | null
  /** Editor document, restored exactly. `null` means parse `html` or `markdown`. */
  json: JSONContent | null
  sourceMode: boolean
  sourceText: string
  sourceOrigin: string
  scrollTop: number
}

export interface TabDocument {
  path: string | null
  name: string
  content: string
  contentFormat?: 'markdown' | 'html'
  frontmatter?: string | null
  format: FileFormat
}

export function snapshotFromDocument(
  document: TabDocument,
  id: string,
  dirty = false
): TabSnapshot {
  const isHtml = document.contentFormat === 'html'
  return {
    id,
    path: document.path,
    name: document.name || 'Sans titre',
    format: document.format,
    frontmatter: isHtml ? (document.frontmatter ?? null) : splitFrontmatter(document.content).frontmatter,
    frontmatterDraft: null,
    dirty,
    markdown: isHtml ? '' : document.content,
    html: isHtml ? document.content : null,
    json: null,
    sourceMode: false,
    sourceText: '',
    sourceOrigin: '',
    scrollTop: 0
  }
}

/** Tab to select after `closedId` leaves the list: the one that takes its place, else the previous. */
export function neighbourAfterClose(ids: readonly string[], closedId: string): string | null {
  const index = ids.indexOf(closedId)
  const remaining = ids.filter((id) => id !== closedId)
  if (remaining.length === 0 || index < 0) return null
  return remaining[Math.min(index, remaining.length - 1)]
}

/** Tab reached by moving `step` places from the active one, wrapping around. */
export function cycleTabId(ids: readonly string[], activeId: string, step: number): string | null {
  if (ids.length < 2) return null
  const index = ids.indexOf(activeId)
  if (index < 0) return null
  return ids[(index + step + ids.length) % ids.length]
}
