import Image from '@tiptap/extension-image'

/**
 * Image node with an optional pixel `width`. The width is a visual-only
 * affordance: it is rendered as an HTML `width` attribute, and — because
 * Markdown has no width field — it is dropped on save without corrupting the
 * portable `![alt](src "title")` output.
 */
export const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      width: {
        default: null,
        renderHTML: (attributes) => {
          const width = attributes.width as number | null | undefined
          return width ? { width: String(width) } : {}
        },
        parseHTML: (element) => {
          const raw = element.getAttribute('width')
          return raw && /^\d+$/.test(raw) ? Number(raw) : null
        }
      }
    }
  }
})
