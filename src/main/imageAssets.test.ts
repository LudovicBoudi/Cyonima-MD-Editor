import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extensionForMimeType, importImageBuffer, importImageFile } from './imageAssets'

let baseDir: string
let sourceDir: string
let docDir: string

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'cyonima-images-'))
  sourceDir = join(baseDir, 'source')
  docDir = join(baseDir, 'doc')
  await import('node:fs/promises').then((fs) => fs.mkdir(sourceDir, { recursive: true }))
  await import('node:fs/promises').then((fs) => fs.mkdir(docDir, { recursive: true }))
})

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true })
})

describe('extensionForMimeType', () => {
  it('maps known image mime types', () => {
    expect(extensionForMimeType('image/png')).toBe('png')
    expect(extensionForMimeType('image/jpeg')).toBe('jpg')
    expect(extensionForMimeType('image/webp')).toBe('webp')
  })

  it('falls back to the subtype or png', () => {
    expect(extensionForMimeType('image/tiff')).toBe('tiff')
    expect(extensionForMimeType('text/plain')).toBe('png')
  })
})

describe('importImageFile', () => {
  it('copies the file into assets/ and returns a relative path', async () => {
    const source = join(sourceDir, 'photo.png')
    await writeFile(source, 'image-bytes')

    const relative = await importImageFile(docDir, source)

    expect(relative).toBe('assets/photo.png')
    expect(await readFile(join(docDir, 'assets', 'photo.png'), 'utf8')).toBe('image-bytes')
  })

  it('deduplicates on name collisions', async () => {
    const source = join(sourceDir, 'photo.png')
    await writeFile(source, 'A')
    const existing = join(docDir, 'assets', 'photo.png')
    await import('node:fs/promises').then((fs) => fs.mkdir(join(docDir, 'assets'), { recursive: true }))
    await writeFile(existing, 'B')

    const relative = await importImageFile(docDir, source)

    expect(relative).toBe('assets/photo-1.png')
  })

  it('references an image already inside assets/ without duplicating', async () => {
    await import('node:fs/promises').then((fs) => fs.mkdir(join(docDir, 'assets'), { recursive: true }))
    const already = join(docDir, 'assets', 'img.png')
    await writeFile(already, 'X')

    const relative = await importImageFile(docDir, already)

    expect(relative).toBe('assets/img.png')
    expect(await readdir(join(docDir, 'assets'))).toEqual(['img.png'])
  })

  it('returns null when the source does not exist', async () => {
    expect(await importImageFile(docDir, join(sourceDir, 'missing.png'))).toBeNull()
  })
})

describe('importImageBuffer', () => {
  it('writes bytes with an extension derived from the mime type', async () => {
    const relative = await importImageBuffer(docDir, new Uint8Array([1, 2, 3]), 'image/png')

    expect(relative).toMatch(/^assets\/pasted-\d+\.png$/)
    const files = await readdir(join(docDir, 'assets'))
    expect(files).toHaveLength(1)
  })
})
