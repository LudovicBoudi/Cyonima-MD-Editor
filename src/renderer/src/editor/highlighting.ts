import { createLowlight } from 'lowlight'
import plaintext from 'highlight.js/lib/languages/plaintext'

/**
 * Syntax highlighter shared by the editor. Only plain text is registered at
 * startup: the 37 common highlight.js grammars are a large chunk that most
 * documents never need, so they are loaded separately after the editor is
 * interactive (see `loadCommonLanguages`).
 */
export const lowlight = createLowlight({ plaintext })

// Unknown or unloaded languages are shown as plain text instead of guessed:
// highlighting a block in the wrong language would be misleading.
lowlight.highlightAuto = (value: string) => lowlight.highlight('plaintext', value)

let loading: Promise<void> | null = null

/** Loads the common grammars once; later calls share the same promise. */
export function loadCommonLanguages(): Promise<void> {
  if (!loading) {
    loading = import('./commonGrammars')
      .then(({ default: common }) => {
        lowlight.register(common)
      })
      .catch((error: unknown) => {
        // Highlighting is an enhancement: a failed chunk must not break editing.
        loading = null
        throw error
      })
  }
  return loading
}
