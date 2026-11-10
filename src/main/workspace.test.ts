import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scanWorkspace } from './workspace'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cyonima-workspace-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('scanWorkspace', () => {
  it('lists Markdown files and folders, folders first, sorted by name', async () => {
    await mkdir(join(root, 'notes'))
    await mkdir(join(root, 'Archives'))
    await writeFile(join(root, 'zèbre.md'), '')
    await writeFile(join(root, 'Alpha.MD'), '')
    await writeFile(join(root, 'notes', 'idée.markdown'), '')

    const state = await scanWorkspace(root)

    expect(state.name).toBe(join(root).split('/').pop())
    expect(state.children.map((node) => `${node.kind}:${node.name}`)).toEqual([
      'folder:Archives',
      'folder:notes',
      'file:Alpha.MD',
      'file:zèbre.md'
    ])
    const notes = state.children[1]
    expect(notes.children).toEqual([
      { kind: 'file', name: 'idée.markdown', path: join(root, 'notes', 'idée.markdown') }
    ])
  })

  it('hides other files, hidden folders and files without a name', async () => {
    await writeFile(join(root, 'image.png'), '')
    await writeFile(join(root, '.md'), '')
    await writeFile(join(root, 'README'), '')
    await mkdir(join(root, '.git'))
    await writeFile(join(root, '.git', 'config.md'), '')
    await writeFile(join(root, 'vrai.txt'), '')

    const state = await scanWorkspace(root)

    expect(state.children.map((node) => node.name)).toEqual(['vrai.txt'])
  })

  it('returns an empty tree for an empty folder', async () => {
    const state = await scanWorkspace(root)

    expect(state).toMatchObject({ root, children: [], truncated: false })
  })

  it('does not fail on a folder that disappeared', async () => {
    const state = await scanWorkspace(join(root, 'absent'))

    expect(state.children).toEqual([])
  })
})
