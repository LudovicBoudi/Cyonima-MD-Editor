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

/**
 * Decorating every match in a 50 000-line document makes search feel slow.
 * The count and replace-all still use every match; only a window around the
 * active one is highlighted.
 */
const MAX_HIGHLIGHTS = 500

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
        const active = Math.max(0, Math.min(activeIndex, ranges.length - 1))
        const start =
          ranges.length <= MAX_HIGHLIGHTS
            ? 0
            : Math.max(0, Math.min(active - MAX_HIGHLIGHTS / 2, ranges.length - MAX_HIGHLIGHTS))
        const visible = ranges.slice(start, start + MAX_HIGHLIGHTS)
        const decorations = visible.map((range, index) =>
          Decoration.inline(range.from, range.to, {
            class: start + index === active ? 'search-match search-match--active' : 'search-match'
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
