import type { FileFormat, LineEnding, TextEncoding } from '../shared/types'

const UTF8_BOM = [0xef, 0xbb, 0xbf]
const UTF16LE_BOM = [0xff, 0xfe]
const UTF16BE_BOM = [0xfe, 0xff]

export interface DecodedDocument {
  /** Document text, normalized to LF for the editor. */
  content: string
  /** Format to reuse when the document is saved. */
  format: FileFormat
  /** True when invalid UTF-8 forced a Windows-1252 fallback. */
  fallback: boolean
}

export function defaultLineEnding(): LineEnding {
  return process.platform === 'win32' ? 'crlf' : 'lf'
}

export function defaultFileFormat(): FileFormat {
  return { encoding: 'utf-8', bom: false, eol: defaultLineEnding() }
}

export function normalizeFileFormat(format?: Partial<FileFormat> | null): FileFormat {
  const fallback = defaultFileFormat()
  if (!format) return fallback

  const isUtf16 = format.encoding === 'utf-16le' || format.encoding === 'utf-16be'
  const encoding: TextEncoding = isUtf16 ? format.encoding! : 'utf-8'

  return {
    encoding,
    // UTF-16 cannot be detected reliably without a BOM, so always keep one.
    bom: isUtf16 ? true : Boolean(format.bom),
    eol: format.eol === 'lf' || format.eol === 'crlf' ? format.eol : fallback.eol
  }
}

export function detectLineEnding(content: string): LineEnding {
  const crlf = content.match(/\r\n/g)?.length ?? 0
  const lf = (content.match(/\n/g)?.length ?? 0) - crlf

  if (crlf === 0 && lf === 0) return defaultLineEnding()
  return crlf >= lf ? 'crlf' : 'lf'
}

export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/g, '\n')
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false
  return prefix.every((byte, index) => bytes[index] === byte)
}

function decodeUtf8(bytes: Uint8Array): { text: string; fallback: boolean } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), fallback: false }
  } catch {
    // Not valid UTF-8: decode as Windows-1252 instead of replacing characters.
    // The caller warns the user and the document will be saved as UTF-8.
    return { text: new TextDecoder('windows-1252').decode(bytes), fallback: true }
  }
}

/**
 * Decodes a file buffer while preserving enough metadata to write it back in
 * the same encoding, with the same BOM and line-ending style.
 */
export function decodeDocument(bytes: Uint8Array): DecodedDocument {
  let encoding: TextEncoding = 'utf-8'
  let bom = false
  let offset = 0

  if (startsWith(bytes, UTF16LE_BOM)) {
    encoding = 'utf-16le'
    bom = true
    offset = 2
  } else if (startsWith(bytes, UTF16BE_BOM)) {
    encoding = 'utf-16be'
    bom = true
    offset = 2
  } else if (startsWith(bytes, UTF8_BOM)) {
    encoding = 'utf-8'
    bom = true
    offset = 3
  }

  const payload = bytes.subarray(offset)
  let text: string
  let fallback = false

  if (encoding === 'utf-8') {
    const result = decodeUtf8(payload)
    text = result.text
    fallback = result.fallback
  } else {
    text = new TextDecoder(encoding === 'utf-16le' ? 'utf-16le' : 'utf-16be').decode(payload)
  }

  return {
    content: normalizeLineEndings(text),
    format: { encoding, bom, eol: detectLineEnding(text) },
    fallback
  }
}

/**
 * Encodes the editor content for disk. The renderer always produces LF, so the
 * original line-ending style is reapplied here, followed by the original
 * encoding and BOM.
 */
export function encodeDocument(content: string, format?: Partial<FileFormat> | null): Buffer {
  const normalized = normalizeFileFormat(format)
  const lfContent = normalizeLineEndings(content)
  const text = normalized.eol === 'crlf' ? lfContent.replace(/\n/g, '\r\n') : lfContent

  if (normalized.encoding === 'utf-16le') {
    return Buffer.concat([Buffer.from(UTF16LE_BOM), Buffer.from(text, 'utf16le')])
  }

  if (normalized.encoding === 'utf-16be') {
    const bytes = Buffer.from(text, 'utf16le')
    bytes.swap16()
    return Buffer.concat([Buffer.from(UTF16BE_BOM), bytes])
  }

  const bytes = Buffer.from(text, 'utf8')
  return normalized.bom ? Buffer.concat([Buffer.from(UTF8_BOM), bytes]) : bytes
}
