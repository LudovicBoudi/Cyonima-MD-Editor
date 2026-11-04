import { ChevronDown } from 'lucide-react'

interface FrontmatterPanelProps {
  value: string
}

/**
 * Frontmatter is metadata, not document content: it is kept out of the
 * ProseMirror document and shown in a read-only, collapsible block. The exact
 * raw text is preserved and re-injected on save.
 */
export function FrontmatterPanel({ value }: FrontmatterPanelProps) {
  const lineCount = value.split(/\r?\n/).length

  return (
    <details className="frontmatter-panel">
      <summary
        className="frontmatter-summary"
        title="Métadonnées du document, conservées telles quelles à l’enregistrement"
      >
        <ChevronDown className="frontmatter-chevron" size={14} strokeWidth={2} aria-hidden="true" />
        <span className="frontmatter-title">Métadonnées YAML</span>
        <span className="frontmatter-meta">
          {lineCount} ligne{lineCount > 1 ? 's' : ''}
        </span>
      </summary>
      <pre className="frontmatter-code">
        <code>{value}</code>
      </pre>
    </details>
  )
}
