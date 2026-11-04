import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import TextAlign from '@tiptap/extension-text-align'
import StarterKit from '@tiptap/starter-kit'
import { RawHtml } from './RawHtml'
import { SearchHighlight } from './searchHighlight'

export function createExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      codeBlock: { HTMLAttributes: { class: 'code-block' } },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow' }
      }
    }),
    Placeholder.configure({
      placeholder: 'Commencez à écrire… Tapez « # » pour un titre, « - » pour une liste.'
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Image.configure({ inline: false, allowBase64: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    RawHtml,
    SearchHighlight,
    TableKit.configure({
      table: { resizable: false, HTMLAttributes: { class: 'md-table' } }
    })
  ]
}
