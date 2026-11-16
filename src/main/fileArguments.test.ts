import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extractFileArgument } from './fileArguments'

let root: string
let document: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cyonima-args-'))
  document = join(root, 'notes.md')
  writeFileSync(document, '# Notes\n', 'utf8')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('extractFileArgument', () => {
  it('accepts an absolute Markdown path', () => {
    expect(extractFileArgument([document])).toBe(document)
  })

  it('resolves a relative path against the working directory', () => {
    expect(extractFileArgument(['notes.md'], root)).toBe(document)
  })

  it('skips flags and non-Markdown files', () => {
    const image = join(root, 'image.png')
    writeFileSync(image, 'x', 'utf8')
    expect(extractFileArgument(['--no-sandbox', 'image.png', 'notes.md'], root)).toBe(document)
  })

  it('accepts a desktop-entry file URI, including encoded characters', () => {
    const spaced = join(root, 'mes notes.markdown')
    writeFileSync(spaced, '# Notes\n', 'utf8')
    expect(extractFileArgument([pathToFileURL(spaced).href])).toBe(spaced)
  })

  it('ignores malformed file URIs', () => {
    expect(extractFileArgument(['file:///%E0%A4%A'])).toBeNull()
  })

  it('accepts the Markdown extensions advertised by the installer', () => {
    for (const extension of ['markdown', 'mdown', 'mkd']) {
      const file = join(root, `notes.${extension}`)
      writeFileSync(file, '# Notes\n', 'utf8')
      expect(extractFileArgument([file])).toBe(file)
    }
  })

  it('returns null when no existing document is passed', () => {
    expect(extractFileArgument(['missing.md'], root)).toBeNull()
    expect(extractFileArgument([], root)).toBeNull()
  })
})
