import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { embedLocalImages } from './embedImages'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1kAAAAASUVORK5CYII=',
  'base64'
)

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cyonima-embed-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

async function writeImage(name = 'photo.png'): Promise<string> {
  const path = join(directory, name)
  await writeFile(path, PNG)
  return path
}

describe('embedLocalImages', () => {
  it('replaces a local-file image with a data URI', async () => {
    const path = await writeImage()
    const html = `<p><img src="local-file://${path}" alt="Photo"></p>`

    const result = await embedLocalImages(html, directory)

    expect(result.embedded).toBe(1)
    expect(result.missing).toEqual([])
    expect(result.html).toContain('src="data:image/png;base64,')
    expect(result.html).not.toContain('local-file://')
    expect(result.html).toContain('alt="Photo"')
  })

  it('resolves relative image paths against the base directory', async () => {
    await mkdir(join(directory, 'assets'))
    await writeImage('assets/photo.png')
    const result = await embedLocalImages('<img src="assets/photo.png">', directory)

    expect(result.embedded).toBe(1)
    expect(result.html).toContain('data:image/png;base64,')
  })

  it('handles an attribute value containing a greater-than sign', async () => {
    const path = await writeImage()
    const result = await embedLocalImages(
      `<img alt="a > b" src="local-file://${path}">`,
      directory
    )

    expect(result.embedded).toBe(1)
    expect(result.html).toContain('alt="a > b"')
    expect(result.html).toContain('data:image/png;base64,')
  })

  it('leaves remote and data images untouched', async () => {
    const html =
      '<img src="https://example.com/a.png"><img src="data:image/png;base64,AAAA">'
    const result = await embedLocalImages(html, directory)

    expect(result).toEqual({ html, embedded: 0, missing: [] })
  })

  it('replaces a missing image with a placeholder and reports it', async () => {
    const path = join(directory, 'absent.png')
    const result = await embedLocalImages(
      `<img src="local-file://${path}" alt="Schéma">`,
      directory
    )

    expect(result.embedded).toBe(0)
    expect(result.missing).toEqual(['absent.png'])
    expect(result.html).toContain('Image introuvable : Schéma')
    expect(result.html).not.toContain('<img')
  })

  it('refuses a local file whose extension is not an image', async () => {
    const path = join(directory, 'secret.txt')
    await writeFile(path, 'pas une image')
    const result = await embedLocalImages(`<img src="local-file://${path}">`, directory)

    expect(result.missing).toEqual(['secret.txt'])
    expect(result.html).toContain('Image introuvable')
    expect(result.html).not.toContain('data:text/plain')
  })

  it('embeds the same image only once per tag but reuses its data URI', async () => {
    const path = await writeImage()
    const html = `<img src="local-file://${path}"><img src="local-file://${path}">`

    const result = await embedLocalImages(html, directory)

    expect(result.embedded).toBe(2)
    expect(result.html.match(/data:image\/png;base64,/g)).toHaveLength(2)
  })
})
