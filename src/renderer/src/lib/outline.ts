import type { Editor } from '@tiptap/core'
import { translate } from '../../../shared/i18n'
import type { Language } from '../../../shared/types'

export interface OutlineItem {
  /** Document position of the heading node, used to navigate to it. */
  pos: number
  level: number
  text: string
}

export function readOutline(editor: Editor, language: Language = 'fr'): OutlineItem[] {
  const items: OutlineItem[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return true
    items.push({
      pos,
      level: Number(node.attrs.level) || 1,
      text: node.textContent.trim() || translate(language, 'outline.untitledHeading')
    })
    return true
  })
  return items
}

/**
 * The active heading is the last one that has reached the reading line: the
 * heading tops are given in the same coordinates as the line. `null` when the
 * reader is above the first heading.
 */
export function activeHeadingIndex(tops: readonly number[], readingLine: number): number | null {
  let active: number | null = null
  tops.forEach((top, index) => {
    if (top <= readingLine) active = index
  })
  return active
}
