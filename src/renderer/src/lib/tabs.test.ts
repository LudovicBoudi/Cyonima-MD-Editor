import { describe, expect, it } from 'vitest'
import { cycleTabId, neighbourAfterClose, snapshotFromDocument } from './tabs'

const FORMAT = { encoding: 'utf-8' as const, bom: false, eol: 'lf' as const }

describe('neighbourAfterClose', () => {
  it('selects the tab that takes the place of the closed one', () => {
    expect(neighbourAfterClose(['a', 'b', 'c'], 'b')).toBe('c')
  })

  it('selects the previous tab when the last one is closed', () => {
    expect(neighbourAfterClose(['a', 'b', 'c'], 'c')).toBe('b')
  })

  it('returns null when no other tab remains or the id is unknown', () => {
    expect(neighbourAfterClose(['a'], 'a')).toBeNull()
    expect(neighbourAfterClose(['a', 'b'], 'z')).toBeNull()
  })
})

describe('cycleTabId', () => {
  it('moves forward and backward and wraps around', () => {
    expect(cycleTabId(['a', 'b', 'c'], 'a', 1)).toBe('b')
    expect(cycleTabId(['a', 'b', 'c'], 'c', 1)).toBe('a')
    expect(cycleTabId(['a', 'b', 'c'], 'a', -1)).toBe('c')
  })

  it('does nothing with a single tab', () => {
    expect(cycleTabId(['a'], 'a', 1)).toBeNull()
  })
})

describe('snapshotFromDocument', () => {
  it('keeps the frontmatter aside and the full text as markdown', () => {
    const content = '---\ntitle: "A"\n---\n\n# Titre\n'
    const snapshot = snapshotFromDocument(
      { path: '/docs/a.md', name: 'a.md', content, format: FORMAT },
      'tab-2',
      true
    )

    expect(snapshot).toMatchObject({
      id: 'tab-2',
      path: '/docs/a.md',
      name: 'a.md',
      dirty: true,
      markdown: content,
      json: null,
      sourceMode: false
    })
    expect(snapshot.frontmatter).toBe('---\ntitle: "A"\n---')
  })

  it('names an unnamed document', () => {
    expect(
      snapshotFromDocument({ path: null, name: '', content: '', format: FORMAT }, 'tab-3').name
    ).toBe('Sans titre')
  })
})
