import { describe, expect, it } from 'vitest'
import {
  decodeDocument,
  defaultFileFormat,
  detectLineEnding,
  encodeDocument,
  normalizeFileFormat
} from './fileFormat'

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])
const UTF16LE_BOM = Buffer.from([0xff, 0xfe])
const UTF16BE_BOM = Buffer.from([0xfe, 0xff])

function utf16le(text: string): Buffer {
  return Buffer.concat([UTF16LE_BOM, Buffer.from(text, 'utf16le')])
}

function utf16be(text: string): Buffer {
  const bytes = Buffer.from(text, 'utf16le')
  bytes.swap16()
  return Buffer.concat([UTF16BE_BOM, bytes])
}

describe('document decoding', () => {
  it('decodes plain UTF-8 without altering the content', () => {
    const source = '# Titre\n\nUn paragraphe.\n'
    const decoded = decodeDocument(Buffer.from(source, 'utf8'))

    expect(decoded).toEqual({
      content: source,
      format: { encoding: 'utf-8', bom: false, eol: 'lf' },
      fallback: false
    })
  })

  it('strips and remembers a UTF-8 BOM', () => {
    const decoded = decodeDocument(
      Buffer.concat([UTF8_BOM, Buffer.from('# Titre\n', 'utf8')])
    )

    expect(decoded.content).toBe('# Titre\n')
    expect(decoded.format).toEqual({ encoding: 'utf-8', bom: true, eol: 'lf' })
  })

  it('normalizes CRLF to LF and remembers the style', () => {
    const decoded = decodeDocument(Buffer.from('Ligne 1\r\nLigne 2\r\n', 'utf8'))

    expect(decoded.content).toBe('Ligne 1\nLigne 2\n')
    expect(decoded.format.eol).toBe('crlf')
  })

  it('uses the dominant line ending for mixed files', () => {
    expect(detectLineEnding('a\r\nb\r\nc\nd\r\n')).toBe('crlf')
    expect(detectLineEnding('a\nb\nc\r\nd\n')).toBe('lf')
    expect(detectLineEnding('une seule ligne')).toBe(
      process.platform === 'win32' ? 'crlf' : 'lf'
    )
  })

  it('decodes UTF-16 LE with its BOM', () => {
    const decoded = decodeDocument(utf16le('# Titre\r\n\r\nCorps.\r\n'))

    expect(decoded.content).toBe('# Titre\n\nCorps.\n')
    expect(decoded.format).toEqual({ encoding: 'utf-16le', bom: true, eol: 'crlf' })
    expect(decoded.fallback).toBe(false)
  })

  it('decodes UTF-16 BE with its BOM', () => {
    const decoded = decodeDocument(utf16be('# Été\n'))

    expect(decoded.content).toBe('# Été\n')
    expect(decoded.format).toEqual({ encoding: 'utf-16be', bom: true, eol: 'lf' })
  })

  it('falls back to Windows-1252 instead of replacing invalid UTF-8', () => {
    const decoded = decodeDocument(Buffer.from([0xe9, 0x20, 0x80, 0x20, 0x74, 0x65, 0x73, 0x74]))

    expect(decoded.content).toBe('é € test')
    expect(decoded.fallback).toBe(true)
    expect(decoded.format.encoding).toBe('utf-8')
  })
})

describe('document encoding', () => {
  const utf8 = { encoding: 'utf-8' as const, bom: false, eol: 'lf' as const }

  it('writes plain UTF-8 without a BOM', () => {
    const bytes = encodeDocument('# Titre\n', utf8)

    expect(bytes.equals(Buffer.from('# Titre\n', 'utf8'))).toBe(true)
  })

  it('restores the UTF-8 BOM', () => {
    const bytes = encodeDocument('# Titre\n', { ...utf8, bom: true })

    expect(bytes.subarray(0, 3).equals(UTF8_BOM)).toBe(true)
    expect(bytes.subarray(3).toString('utf8')).toBe('# Titre\n')
  })

  it('converts LF to CRLF on save', () => {
    const bytes = encodeDocument('Ligne 1\nLigne 2\n', { ...utf8, eol: 'crlf' })

    expect(bytes.toString('utf8')).toBe('Ligne 1\r\nLigne 2\r\n')
  })

  it('does not double existing CRLF sequences', () => {
    const bytes = encodeDocument('Ligne 1\r\nLigne 2\r\n', { ...utf8, eol: 'crlf' })

    expect(bytes.toString('utf8')).toBe('Ligne 1\r\nLigne 2\r\n')
  })

  it('writes UTF-16 LE with a BOM and round-trips', () => {
    const bytes = encodeDocument('Bonjour\n', {
      encoding: 'utf-16le',
      bom: true,
      eol: 'lf'
    })

    expect(bytes.subarray(0, 2).equals(UTF16LE_BOM)).toBe(true)
    expect(decodeDocument(bytes).content).toBe('Bonjour\n')
  })

  it('writes UTF-16 BE with a BOM and round-trips', () => {
    const bytes = encodeDocument('Bonjour\n', {
      encoding: 'utf-16be',
      bom: true,
      eol: 'lf'
    })

    expect(bytes.subarray(0, 2).equals(UTF16BE_BOM)).toBe(true)
    expect(decodeDocument(bytes).content).toBe('Bonjour\n')
  })

  it('preserves BOM, encoding and line endings across a full round-trip', () => {
    const source = Buffer.concat([UTF8_BOM, Buffer.from('# Titre\r\n\r\nCorps.\r\n', 'utf8')])
    const decoded = decodeDocument(source)

    expect(encodeDocument(decoded.content, decoded.format).equals(source)).toBe(true)
  })

  it('falls back to safe defaults for incomplete format metadata', () => {
    expect(normalizeFileFormat(null)).toEqual(defaultFileFormat())
    expect(normalizeFileFormat({ encoding: 'utf-16le', bom: false })).toEqual({
      encoding: 'utf-16le',
      bom: true,
      eol: defaultFileFormat().eol
    })
  })
})
