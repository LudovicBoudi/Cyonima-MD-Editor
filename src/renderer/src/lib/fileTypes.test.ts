import { describe, expect, it } from 'vitest'
import { isMarkdownFileName } from './fileTypes'

describe('isMarkdownFileName', () => {
  it('recognises Markdown extensions', () => {
    expect(isMarkdownFileName('note.md')).toBe(true)
    expect(isMarkdownFileName('note.markdown')).toBe(true)
    expect(isMarkdownFileName('note.mdown')).toBe(true)
    expect(isMarkdownFileName('note.mkd')).toBe(true)
    expect(isMarkdownFileName('note.txt')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isMarkdownFileName('NOTE.MD')).toBe(true)
  })

  it('rejects other file types', () => {
    expect(isMarkdownFileName('image.png')).toBe(false)
    expect(isMarkdownFileName('archive.zip')).toBe(false)
    expect(isMarkdownFileName('no-extension')).toBe(false)
  })
})
