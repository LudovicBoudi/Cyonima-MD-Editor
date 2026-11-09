import Link from '@tiptap/extension-link'

/**
 * The stock Link mark only keeps href/target/rel/class. Reference links also
 * need their identifier and the form they used (`[text][id]`, `[text][]` or
 * `[id]`) so that saving does not turn them into inline links.
 */
export const ReferenceLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      referenceId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-reference-id'),
        renderHTML: (attributes) =>
          attributes.referenceId
            ? { 'data-reference-id': String(attributes.referenceId) }
            : {}
      },
      referenceStyle: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-reference-style'),
        renderHTML: (attributes) =>
          attributes.referenceStyle
            ? { 'data-reference-style': String(attributes.referenceStyle) }
            : {}
      }
    }
  }
})
