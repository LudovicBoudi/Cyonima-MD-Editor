import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  convertDocxToMarkdown,
  discardExtractedMedia,
  findPandoc,
  imageTagsToMarkdown,
  importDocxFile,
  normalizePandocOutput,
  pandocArgs,
  resetPandocCache,
  uniqueMediaFolder
} from './pandoc'

let directory: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'cyonima-pandoc-'))
  resetPandocCache()
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

function fakePandoc(script: string): string {
  const file = join(directory, 'pandoc')
  writeFileSync(file, `#!/usr/bin/env node\n${script}`, 'utf8')
  chmodSync(file, 0o755)
  return file
}

describe('findPandoc', () => {
  it('reports the version of an available command', async () => {
    const info = await findPandoc(process.execPath)

    expect(info?.path).toBe(process.execPath)
    expect(info?.version).toMatch(/^v?\d+\.\d+/)
  })

  it('returns null when the command is missing', async () => {
    expect(await findPandoc(join(directory, 'absent-pandoc'))).toBeNull()
  })

  it('caches the default detection', async () => {
    const first = await findPandoc()
    const second = await findPandoc()
    expect(second).toBe(first)
  })
})

describe('pandocArgs', () => {
  it('asks for GitHub-flavoured Markdown without wrapping', () => {
    expect(pandocArgs('notes_media', '/tmp/notes.docx')).toEqual([
      '--from=docx',
      '--to=gfm',
      '--wrap=none',
      '--extract-media=notes_media',
      '/tmp/notes.docx'
    ])
  })
})

describe('uniqueMediaFolder', () => {
  it('uses the document name and avoids existing folders', () => {
    expect(uniqueMediaFolder(directory, 'compte-rendu')).toBe('compte-rendu_media')
    mkdirSync(join(directory, 'compte-rendu_media'))
    expect(uniqueMediaFolder(directory, 'compte-rendu')).toBe('compte-rendu_media-2')
    mkdirSync(join(directory, 'compte-rendu_media-2'))
    expect(uniqueMediaFolder(directory, 'compte-rendu')).toBe('compte-rendu_media-3')
  })
})

describe('normalizePandocOutput', () => {
  it('normalizes line endings and keeps a single final newline', () => {
    expect(normalizePandocOutput('# Titre\r\n\r\nTexte\r\n\r\n')).toBe('# Titre\n\nTexte\n')
  })

  it('returns an empty string for empty output', () => {
    expect(normalizePandocOutput(' \r\n')).toBe('')
  })
})

describe('imageTagsToMarkdown', () => {
  it('turns raw image tags into Markdown images', () => {
    expect(imageTagsToMarkdown('<img src="media/image1.png" alt="Schéma" width="200" />')).toBe(
      '![Schéma](media/image1.png)'
    )
  })

  it('wraps destinations containing spaces and escapes brackets in the alt text', () => {
    expect(imageTagsToMarkdown('<img alt="Schéma [1]" src="media/image 1.png">')).toBe(
      '![Schéma \\[1\\]](<media/image 1.png>)'
    )
  })

  it('leaves image tags inside code blocks and code spans untouched', () => {
    const markdown = [
      '```html',
      '<img src="media/exemple.png" alt="exemple" />',
      '```',
      '',
      'Exemple : `<img src="media/exemple.png" />` et <img src="media/photo.png" alt="Photo" />'
    ].join('\n')

    const converted = imageTagsToMarkdown(markdown)

    expect(converted).toContain('```html\n<img src="media/exemple.png" alt="exemple" />\n```')
    expect(converted).toContain('`<img src="media/exemple.png" />`')
    expect(converted).toContain('![Photo](media/photo.png)')
  })

  it('leaves tags without a source untouched', () => {
    expect(imageTagsToMarkdown('<img alt="sans source">')).toBe('<img alt="sans source">')
  })
})

describe.skipIf(process.platform === 'win32')('convertDocxToMarkdown', () => {
  const conversion = `
const fs = require('fs')
const path = require('path')
const args = process.argv.slice(2)
const media = args.find((arg) => arg.startsWith('--extract-media='))
const folder = media.slice('--extract-media='.length)
fs.mkdirSync(path.join(process.cwd(), folder, 'media'), { recursive: true })
fs.writeFileSync(path.join(process.cwd(), folder, 'media', 'image1.png'), 'png')
process.stdout.write('# Titre\\r\\n\\r\\n![](media/image1.png)\\r\\n\\r\\n![](media/dessin.emf)\\r\\n')
`

  it('writes the conversion to the target folder with relative images', async () => {
    const pandocPath = fakePandoc(conversion)
    const targetPath = join(directory, 'compte-rendu.md')

    const result = await convertDocxToMarkdown({
      pandocPath,
      docxPath: join(directory, 'source.docx'),
      targetPath
    })

    expect(result.markdown).toBe(
      '# Titre\n\n![](media/image1.png)\n\n![](media/dessin.emf)\n'
    )
    expect(result.mediaFolder).toBe('compte-rendu_media')
    expect(result.unsupportedImages).toEqual(['dessin.emf'])
    expect(existsSync(join(directory, 'compte-rendu_media', 'media', 'image1.png'))).toBe(true)
  })

  it('removes extracted images when Pandoc fails', async () => {
    const pandocPath = fakePandoc(`
const fs = require('fs')
const path = require('path')
const args = process.argv.slice(2)
const media = args.find((arg) => arg.startsWith('--extract-media='))
fs.mkdirSync(path.join(process.cwd(), media.slice('--extract-media='.length)), { recursive: true })
process.stderr.write('conversion failed')
process.exit(1)
`)
    const targetPath = join(directory, 'echec.md')

    await expect(
      convertDocxToMarkdown({
        pandocPath,
        docxPath: join(directory, 'source.docx'),
        targetPath
      })
    ).rejects.toThrow('Pandoc n’a pas pu convertir le document')

    expect(existsSync(join(directory, 'echec_media'))).toBe(false)
  })

  it('handles a conversion without images', async () => {
    const pandocPath = fakePandoc(`
process.stdout.write('# Importé\\n')
`)
    const result = await convertDocxToMarkdown({
      pandocPath,
      docxPath: join(directory, 'source.docx'),
      targetPath: join(directory, 'simple.md')
    })

    expect(result.markdown).toBe('# Importé\n')
    expect(result.mediaFolder).toBeNull()
    expect(result.unsupportedImages).toEqual([])
  })
})

describe.skipIf(process.platform === 'win32')('importDocxFile', () => {
  it('writes the converted Markdown to the chosen path', async () => {
    const pandocPath = fakePandoc(`
const fs = require('fs')
const path = require('path')
const args = process.argv.slice(2)
const media = args.find((arg) => arg.startsWith('--extract-media='))
fs.mkdirSync(path.join(process.cwd(), media.slice('--extract-media='.length)), { recursive: true })
process.stdout.write('# Importé\\n\\n![](media/image1.png)\\n')
`)
    const targetPath = join(directory, 'importé.md')

    const result = await importDocxFile({
      pandocPath,
      docxPath: join(directory, 'source.docx'),
      targetPath
    })

    expect(result.targetPath).toBe(targetPath)
    expect(readFileSync(targetPath, 'utf8')).toBe('# Importé\n\n![](media/image1.png)\n')
    expect(existsSync(join(directory, 'importé_media'))).toBe(true)
  })
})

describe('discardExtractedMedia', () => {
  it('removes the extracted folder and tolerates a missing one', async () => {
    mkdirSync(join(directory, 'notes_media'))
    await discardExtractedMedia(join(directory, 'notes.md'), 'notes_media')
    expect(existsSync(join(directory, 'notes_media'))).toBe(false)

    await expect(discardExtractedMedia(join(directory, 'notes.md'), null)).resolves.toBeUndefined()
  })
})
