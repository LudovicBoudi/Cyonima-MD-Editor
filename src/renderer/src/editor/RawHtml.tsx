import { mergeAttributes, Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Braces } from 'lucide-react'
import { decodeRawHtml, encodeRawHtml } from './rawHtmlSerialization'
import { useI18n } from '../lib/i18n'

function RawHtmlBlockView({ node }: NodeViewProps) {
  const { t } = useI18n()
  const source = String(node.attrs.source ?? '')
  const lineCount = source ? source.split(/\r?\n/).length : 0

  return (
    <NodeViewWrapper className="raw-html-block" data-drag-handle contentEditable={false}>
      <div className="raw-html-header">
        <Braces className="raw-html-icon" size={13} strokeWidth={2} aria-hidden="true" />
        <span className="raw-html-title">{t('rawHtml.title')}</span>
        <span className="raw-html-meta">
          {t(lineCount > 1 ? 'rawHtml.metaOther' : 'rawHtml.metaOne', { count: lineCount })}
        </span>
      </div>
      <pre className="raw-html-code">
        <code>{source}</code>
      </pre>
    </NodeViewWrapper>
  )
}

/**
 * Opaque block for raw HTML that has no Markdown/WYSIWYG equivalent.
 * It is never injected as markup: the source is displayed as escaped text and
 * written back verbatim when the document is saved.
 */
export const RawHtml = Node.create({
  name: 'rawHtml',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      source: {
        default: '',
        parseHTML: (element) => decodeRawHtml(element.getAttribute('data-raw-html')),
        renderHTML: (attributes) => ({
          'data-raw-html': encodeRawHtml(String(attributes.source ?? ''))
        })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-raw-html]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // Turndown skips blank nodes before custom rules run. A zero-width space
    // keeps the placeholder "non-blank"; the raw source stays in the attribute
    // and the custom Turndown rule ignores this text node entirely.
    return ['div', mergeAttributes(HTMLAttributes, { class: 'raw-html-node' }), '\u200B']
  },

  addNodeView() {
    return ReactNodeViewRenderer(RawHtmlBlockView)
  }
})
