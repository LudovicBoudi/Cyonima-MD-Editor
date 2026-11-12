import { describe, expect, it } from 'vitest'
import { loadCommonLanguages, lowlight } from './highlighting'

describe('lazy syntax highlighting', () => {
  it('always includes the plain-text fallback', () => {
    expect(lowlight.listLanguages()).toContain('plaintext')
  })

  it('registers the common grammars on demand', async () => {
    await loadCommonLanguages()

    expect(lowlight.listLanguages()).toEqual(expect.arrayContaining(['typescript', 'python', 'yaml']))
    expect(lowlight.highlight('typescript', 'const x: number = 1').children.length).toBeGreaterThan(0)
  })
})
