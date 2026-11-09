import { mergeAttributes, Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Link2 } from 'lucide-react'

function ReferenceDefinitionView({ node }: NodeViewProps) {
  const id = String(node.attrs.id ?? '')
  const href = String(node.attrs.href ?? '')
  const title = String(node.attrs.title ?? '')

  return (
    <NodeViewWrapper
      className="reference-definition"
      data-reference-definition={id}
      data-drag-handle
      contentEditable={false}
    >
      <Link2
        className="reference-definition-icon"
        size={14}
        strokeWidth={1.9}
        aria-hidden="true"
      />
      <span className="reference-definition-label">[{id}]</span>
      <span className="reference-definition-href" title={href}>
        {href}
      </span>
      {title ? <span className="reference-definition-title">« {title} »</span> : null}
    </NodeViewWrapper>
  )
}

/**
 * A link reference definition (`[id]: url "title"`). It is kept in place so
 * the order of definitions survives a round-trip, and displayed as a compact
 * row instead of raw Markdown.
 */
export const ReferenceDefinition = Node.create({
  name: 'referenceDefinition',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-reference-definition') ?? '',
        renderHTML: (attributes) => ({
          'data-reference-definition': String(attributes.id ?? '')
        })
      },
      href: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-href') ?? '',
        renderHTML: (attributes) => ({ 'data-href': String(attributes.href ?? '') })
      },
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-title') ?? '',
        renderHTML: (attributes) => ({ 'data-title': String(attributes.title ?? '') })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-reference-definition]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // Turndown skips empty nodes before custom rules run; the zero-width space
    // keeps this placeholder non-blank.
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'reference-definition' }),
      '\u200B'
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReferenceDefinitionView)
  }
})
