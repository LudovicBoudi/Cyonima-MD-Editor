import { describe, expect, it } from 'vitest'
import { splitFrontmatter } from './markdown'
import {
  checkFrontmatterYaml,
  defaultFrontmatterYaml,
  frontmatterBlock,
  frontmatterBody
} from './frontmatter'

describe('frontmatterBody and frontmatterBlock', () => {
  it('extracts the YAML between the fences', () => {
    expect(frontmatterBody('---\ntitle: "Un"\nauthor: X\n---')).toBe('title: "Un"\nauthor: X\n')
  })

  it('handles the closing `...` fence and an empty block', () => {
    expect(frontmatterBody('---\ntitle: A\n...')).toBe('title: A\n')
    expect(frontmatterBody('---\n---')).toBe('')
  })

  it('rebuilds the block with fences and trims surrounding blank lines', () => {
    expect(frontmatterBlock('\ntitle: A\n\n\n')).toBe('---\ntitle: A\n---')
  })

  it('keeps trailing spaces on content lines', () => {
    expect(frontmatterBlock('title: A  \n')).toBe('---\ntitle: A  \n---')
  })

  it('returns null for blank YAML so the block is removed', () => {
    expect(frontmatterBlock('  \n\n')).toBeNull()
  })

  it('round-trips a document without changing the body', () => {
    const markdown = '---\ntitle: "Rapport"\ntags: [a, b]\n---\n\n# Titre\n\nTexte.\n'
    const parts = splitFrontmatter(markdown)
    const block = frontmatterBlock(frontmatterBody(parts.frontmatter ?? ''))

    expect(block).toBe(parts.frontmatter)
  })
})

describe('defaultFrontmatterYaml', () => {
  it('creates a quoted title from the file name', () => {
    expect(defaultFrontmatterYaml('notes de réunion.md')).toBe('title: "notes de réunion"\n')
    expect(defaultFrontmatterYaml('Sans titre')).toBe('title: "Sans titre"\n')
  })

  it('escapes quotes in the title', () => {
    const yaml = defaultFrontmatterYaml('Le "vrai" plan.md')
    expect(checkFrontmatterYaml(yaml)).toEqual({ ok: true })
  })
})

describe('checkFrontmatterYaml', () => {
  it('accepts mappings and empty text', () => {
    expect(checkFrontmatterYaml('title: A\nlist:\n  - one\n  - two\n')).toEqual({ ok: true })
    expect(checkFrontmatterYaml('')).toEqual({ ok: true })
    expect(checkFrontmatterYaml('# seulement un commentaire')).toEqual({ ok: true })
  })

  it('reports the line of a syntax error', () => {
    const result = checkFrontmatterYaml('title: A\nauthor: [oups\n')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/Syntaxe YAML invalide à la ligne \d+/)
  })

  it('refuses top-level lists and scalars', () => {
    expect(checkFrontmatterYaml('- a\n- b')).toMatchObject({ ok: false })
    expect(checkFrontmatterYaml('just text')).toMatchObject({ ok: false })
  })

  it('refuses a line that would close the block early', () => {
    expect(checkFrontmatterYaml('title: A\n---\nauthor: B')).toMatchObject({ ok: false })
  })

  it('reports errors in the interface language', () => {
    expect(checkFrontmatterYaml('title: A\n---\nauthor: B', 'en')).toMatchObject({
      ok: false,
      message: 'A line containing only “---” would close the block. Remove it.'
    })
    expect(defaultFrontmatterYaml('', 'en')).toBe('title: "Untitled"\n')
  })
})
