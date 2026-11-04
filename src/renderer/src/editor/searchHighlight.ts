import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface SearchRange {
  from: number
  to: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchHighlight: {
      setSearchHighlight: (ranges: SearchRange[], activeIndex: number) => ReturnType
      clearSearchHighlight: () => ReturnType
    }
  }
}

const SEARCH_KEY = new PluginKey<DecorationSet>('searchHighlight')

interface SearchMeta {
  decorations: DecorationSet
}

/**
 * Highlights search matches as inline decorations. Matches are pushed from the
 * UI as document ranges; the active match gets a distinct class. The decoration
 * set is mapped across edits automatically.
 */
export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: SEARCH_KEY,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => {
            const meta = tr.getMeta(SEARCH_KEY) as SearchMeta | undefined
            if (meta?.decorations) return meta.decorations
            return set.map(tr.mapping, tr.doc)
          }
        },
        props: {
          decorations: (state) => SEARCH_KEY.getState(state) ?? DecorationSet.empty
        }
      })
    ]
  },

  addCommands() {
    return {
      setSearchHighlight: (ranges: SearchRange[], activeIndex: number) => ({ editor }) => {
        const decorations = ranges.map((range, index) =>
          Decoration.inline(range.from, range.to, {
            class: index === activeIndex ? 'search-match search-match--active' : 'search-match'
          })
        )
        const set = DecorationSet.create(editor.state.doc, decorations)
        editor.view.dispatch(editor.state.tr.setMeta(SEARCH_KEY, { decorations: set }))
        return true
      },
      clearSearchHighlight: () => ({ editor }) => {
        editor.view.dispatch(
          editor.state.tr.setMeta(SEARCH_KEY, { decorations: DecorationSet.empty })
        )
        return true
      }
    }
  }
})
