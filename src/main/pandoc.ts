import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { rm } from 'fs/promises'
import { basename, dirname, extname, join } from 'path'
import { promisify } from 'util'
import { writeFileAtomic } from './atomicWrite'

const run = promisify(execFile)

const MAX_CONVERSION_OUTPUT = 64 * 1024 * 1024

/** Images the editor cannot display, so the import can warn about them. */
const UNSUPPORTED_IMAGE_EXTENSIONS = new Set(['.emf', '.wmf', '.tif', '.tiff'])

export interface PandocInfo {
  /** Command or path to invoke. */
  path: string
  /** First line of `pandoc --version`, shown in diagnostics. */
  version: string
}

export interface DocxConversion {
  markdown: string
  /** Folder holding extracted images, relative to the Markdown file. */
  mediaFolder: string | null
  /** Image references the editor will not be able to render. */
  unsupportedImages: string[]
}

let cachedPandoc: Promise<PandocInfo | null> | null = null

/** Forgets a previous detection, used when the availability is re-checked. */
export function resetPandocCache(): void {
  cachedPandoc = null
}

async function detectPandoc(command: string): Promise<PandocInfo | null> {
  try {
    const { stdout } = await run(command, ['--version'], {
      timeout: 5000,
      windowsHide: true
    })
    const version = stdout.split(/\r?\n/)[0]?.trim() ?? ''
    return version ? { path: command, version } : null
  } catch {
    return null
  }
}

/**
 * Finds Pandoc on the PATH. The answer is cached because the check happens on
 * every import, but a missing install only changes after a restart anyway.
 */
export function findPandoc(command = 'pandoc'): Promise<PandocInfo | null> {
  if (command !== 'pandoc') return detectPandoc(command)
  cachedPandoc ??= detectPandoc(command)
  return cachedPandoc
}

export function pandocArgs(mediaFolder: string, docxPath: string): string[] {
  return [
    '--from=docx',
    '--to=gfm',
    '--wrap=none',
    `--extract-media=${mediaFolder}`,
    docxPath
  ]
}

/** A fresh folder name next to the Markdown file, never an existing one. */
export function uniqueMediaFolder(directory: string, baseName: string): string {
  const stem = baseName.replace(/\.md$/i, '') || 'document'
  let candidate = `${stem}_media`
  let suffix = 2
  while (existsSync(join(directory, candidate))) {
    candidate = `${stem}_media-${suffix}`
    suffix++
  }
  return candidate
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function htmlAttribute(attributes: string, name: string): string | null {
  const pattern = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`,
    'i'
  )
  const match = pattern.exec(attributes)
  if (!match) return null
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? '')
}

/** One `<img>` tag as a Markdown image, dropping dimensions Markdown cannot store. */
function imageTagToMarkdown(tag: string, attributes: string): string {
  const source = htmlAttribute(attributes, 'src')
  if (!source) return tag
  const alt = (htmlAttribute(attributes, 'alt') ?? '').replace(/[\\[\]]/g, '\\$&')
  const destination = /[\s()<>]/.test(source) ? `<${source}>` : source
  return `![${alt}](${destination})`
}

function convertImagesOutsideCode(line: string): string {
  return line
    .split(/(`+[^`]*?`+)/g)
    .map((segment, index) =>
      index % 2 === 1
        ? segment
        : segment.replace(/<img\b([^>]*?)\/?>/gi, imageTagToMarkdown)
    )
    .join('')
}

/**
 * The GFM writer emits a raw `<img>` tag when the source image carries
 * dimensions it cannot express in Markdown. The editor shows images through
 * Markdown syntax, so those tags become ordinary image links; widths and
 * heights are dropped because Markdown cannot store them. Code blocks and
 * code spans are left untouched.
 */
export function imageTagsToMarkdown(markdown: string): string {
  let fence: string | null = null
  return markdown
    .split('\n')
    .map((line) => {
      const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
      if (marker) {
        const character = marker[1][0]
        if (fence === null) fence = character
        else if (fence === character) fence = null
        return line
      }
      return fence === null ? convertImagesOutsideCode(line) : line
    })
    .join('\n')
}

export function normalizePandocOutput(text: string): string {
  const normalized = imageTagsToMarkdown(text)
    .replace(/\r\n?/g, '\n')
    .replace(/\s+$/, '')
  return normalized ? `${normalized}\n` : ''
}

function decodePath(value: string): string {
  try {
    return decodeURI(value)
  } catch {
    return value
  }
}

function unsupportedImagesIn(markdown: string): string[] {
  const found = new Set<string>()
  const pattern = /!\[[^\]]*\]\((<[^>]+>|[^)\s]+)\)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(markdown))) {
    const destination = decodePath(match[1]).replace(/^<|>$/g, '')
    const extension = extname(destination).toLowerCase()
    if (UNSUPPORTED_IMAGE_EXTENSIONS.has(extension)) found.add(basename(destination))
  }
  return [...found]
}

/**
 * Converts a Word document to GitHub-flavoured Markdown. Embedded images are
 * extracted into a sibling folder and referenced relatively, so the Markdown
 * stays portable. On failure, an extracted media folder is removed.
 */
export async function convertDocxToMarkdown(options: {
  pandocPath: string
  docxPath: string
  targetPath: string
}): Promise<DocxConversion> {
  const directory = dirname(options.targetPath)
  const mediaFolder = uniqueMediaFolder(
    directory,
    basename(options.targetPath, extname(options.targetPath))
  )
  const mediaPath = join(directory, mediaFolder)

  try {
    const { stdout } = await run(
      options.pandocPath,
      pandocArgs(mediaFolder, options.docxPath),
      {
        cwd: directory,
        maxBuffer: MAX_CONVERSION_OUTPUT,
        windowsHide: true
      }
    )
    const markdown = normalizePandocOutput(stdout)
    return {
      markdown,
      mediaFolder: existsSync(mediaPath) ? mediaFolder : null,
      unsupportedImages: unsupportedImagesIn(markdown)
    }
  } catch (error) {
    await rm(mediaPath, { recursive: true, force: true }).catch(() => undefined)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Pandoc n’a pas pu convertir le document : ${message}`)
  }
}

/** Removes images extracted for an import that could not be completed. */
export async function discardExtractedMedia(
  targetPath: string,
  mediaFolder: string | null
): Promise<void> {
  if (!mediaFolder) return
  await rm(join(dirname(targetPath), mediaFolder), { recursive: true, force: true }).catch(
    () => undefined
  )
}

export interface DocxImportResult extends DocxConversion {
  targetPath: string
}

/**
 * Converts a Word document and writes the Markdown next to it. If the write
 * fails, the images extracted for this import are removed so nothing half
 * finished is left behind.
 */
export async function importDocxFile(options: {
  pandocPath: string
  docxPath: string
  targetPath: string
}): Promise<DocxImportResult> {
  const conversion = await convertDocxToMarkdown(options)
  try {
    await writeFileAtomic(options.targetPath, Buffer.from(conversion.markdown, 'utf8'))
  } catch (error) {
    await discardExtractedMedia(options.targetPath, conversion.mediaFolder)
    throw error
  }
  return { ...conversion, targetPath: options.targetPath }
}
