import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { TableMap } from '@tiptap/pm/tables'
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model'

export type TableAlignment = 'left' | 'center' | 'right'

const CELL_TYPES = new Set(['tableCell', 'tableHeader'])

interface TableContext {
  table: ProseMirrorNode
  tableStart: number
  cellDepth: number
}

function tableContext(editor: Editor): TableContext | null {
  const { $from } = editor.state.selection

  let cellDepth = -1
  for (let depth = $from.depth; depth > 0; depth--) {
    if (CELL_TYPES.has($from.node(depth).type.name)) {
      cellDepth = depth
      break
    }
  }
  if (cellDepth < 2) return null

  const tableDepth = cellDepth - 2
  const table = $from.node(tableDepth)
  if (table.type.name !== 'table') return null

  return { table, tableStart: $from.start(tableDepth), cellDepth }
}

/**
 * Applies an alignment to the whole column under the selection. Markdown only
 * stores one alignment per column (`:---`, `:---:`, `---:`), so aligning a
 * single cell would not survive a save.
 */
export function setColumnAlignment(editor: Editor, align: TableAlignment): boolean {
  const context = tableContext(editor)
  if (!context) return false

  const { state, view } = editor
  const { table, tableStart, cellDepth } = context
  const map = TableMap.get(table)
  const cellOffset = state.selection.$from.before(cellDepth) - tableStart
  const { left, right } = map.findCell(cellOffset)

  const tr = state.tr
  for (let row = 0; row < map.height; row++) {
    for (let column = left; column < right; column++) {
      const offset = map.positionAt(row, column, table)
      const cell = table.nodeAt(offset)
      if (!cell || !CELL_TYPES.has(cell.type.name) || cell.attrs.align === align) continue
      tr.setNodeMarkup(tableStart + offset, undefined, { ...cell.attrs, align })
    }
  }

  if (!tr.docChanged) return false
  view.dispatch(tr)
  return true
}

function firstRow(table: ProseMirrorNode): ProseMirrorNode | null {
  return table.firstChild
}

function isHeaderRow(row: ProseMirrorNode): boolean {
  return row.firstChild?.type.name === 'tableHeader'
}

/** "Disabled" is a blank header row: GFM has no syntax for a missing header. */
export function isTableHeaderEnabled(editor: Editor): boolean {
  const context = tableContext(editor)
  if (!context) return false
  const row = firstRow(context.table)
  return Boolean(row && isHeaderRow(row) && row.textContent.trim() !== '')
}

function convertRow(schema: Schema, row: ProseMirrorNode, header: boolean): ProseMirrorNode {
  const cellType = schema.nodes[header ? 'tableHeader' : 'tableCell']
  const cells: ProseMirrorNode[] = []
  row.forEach((cell) => {
    cells.push(cellType.create(cell.attrs, cell.content))
  })
  return schema.nodes.tableRow.create(row.attrs, cells)
}

function emptyHeaderRow(schema: Schema, source: ProseMirrorNode): ProseMirrorNode {
  const cells: ProseMirrorNode[] = []
  source.forEach((cell) => {
    cells.push(
      schema.nodes.tableHeader.create(
        { ...cell.attrs, align: null },
        schema.nodes.paragraph.create()
      )
    )
  })
  return schema.nodes.tableRow.create(source.attrs, cells)
}

/**
 * Toggle a table header. Markdown always needs a header row, so disabling
 * inserts a blank one above the data; enabling removes that blank row and
 * promotes the first data row. Both states round-trip through a save.
 */
export function toggleTableHeader(editor: Editor): boolean {
  const context = tableContext(editor)
  if (!context) return false

  const { state, view } = editor
  const { table, tableStart } = context
  const first = firstRow(table)
  if (!first) return false

  const header = isHeaderRow(first)
  const enabled = header && first.textContent.trim() !== ''
  const { schema } = state
  const tr = state.tr

  if (enabled) {
    const blank = emptyHeaderRow(schema, first)
    const data = convertRow(schema, first, false)
    tr.insert(tableStart, blank)
    tr.replaceWith(tableStart + blank.nodeSize, tableStart + blank.nodeSize + first.nodeSize, data)
  } else {
    let rowStart = tableStart
    let row = first
    if (header) {
      if (table.childCount < 2) return false
      tr.delete(tableStart, tableStart + first.nodeSize)
      row = table.child(1)
    }

    tr.replaceWith(rowStart, rowStart + row.nodeSize, convertRow(schema, row, true))
  }

  const mapped = tr.mapping.map(state.selection.from)
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(mapped, tr.doc.content.size))))
  view.dispatch(tr)
  return true
}
