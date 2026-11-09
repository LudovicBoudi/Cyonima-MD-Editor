import type { Transaction } from '@tiptap/pm/state'
import { ReplaceStep } from '@tiptap/pm/transform'
import type { Step } from '@tiptap/pm/transform'

/**
 * The trailing-node extension adds an empty paragraph after a document that
 * ends with a block other than a paragraph (a footnote or reference
 * definition, for example). Markdown has no trace of it, so it must not mark
 * the document as modified.
 */
function isEmptyTrailingParagraph(step: Step): boolean {
  if (!(step instanceof ReplaceStep)) return false
  const { from, to, slice } = step
  const content = slice.content
  return (
    from === to &&
    content.childCount === 1 &&
    content.firstChild?.type.name === 'paragraph' &&
    content.firstChild.content.size === 0
  )
}

/**
 * Tells whether an editor update changes the document content. Updates that
 * only come from focusing the editor, plus the trailing paragraph above, are
 * not content changes.
 */
export function isContentChange(transaction: Transaction, appended: readonly Transaction[]): boolean {
  if (transaction.steps.length > 0) return true
  return appended.some((tr) => tr.steps.some((step) => !isEmptyTrailingParagraph(step)))
}
