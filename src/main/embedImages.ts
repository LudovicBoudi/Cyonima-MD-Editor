import { readFile } from 'fs/promises'
import { basename, extname, isAbsolute, resolve } from 'node:path'
import { IMAGE_MIME } from './imageAssets'

export interface EmbeddedImagesResult {
  html: string
  /** Number of images replaced by a data URI. */
  embedded: number
  /** Display names of local images that could not be embedded. */
  missing: string[]
}

/**
 * Matches an `<img>` tag while allowing `>` inside quoted attribute values, so
 * an alt text such as `a > b` cannot truncate the match.
 */
const IMG_TAG = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi
const SRC_ATTRIBUTE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i
const ALT_ATTRIBUTE = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Extracts the filesystem path behind an image source. Returns `null` for
 * remote, data and blob URLs, which are left untouched in the export.
 */
function localPathFromSource(source: string): string | null {
  const src = source.trim()
  if (!src || src.startsWith('#') || /^(?:data|blob|https?):/i.test(src)) return null

  if (src.startsWith('local-file://')) {
    return decodePath(src.slice('local-file://'.length))
  }

  if (src.startsWith('file://')) {
    let path = decodePath(src.slice('file://'.length).split(/[?#]/)[0])
    // file:///C:/... becomes /C:/... ; drop the leading slash on Windows.
    if (/^\/[A-Za-z]:[\\/]/.test(path)) path = path.slice(1)
    return path
  }

  // A Windows drive path looks like a URL scheme; keep it as a local path.
  if (/^[A-Za-z]:[\\/]/.test(src)) return src

  // Any other scheme (mailto:, ftp:, …) is not a local image.
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(src)) return null

  return decodePath(src.split(/[?#]/)[0])
}

function attributeValue(tag: string, pattern: RegExp): string {
  const match = pattern.exec(tag)
  if (!match) return ''
  return match[1] ?? match[2] ?? ''
}

/**
 * Replaces every local image of the HTML document with a data URI. Remote and
 * data images are left as-is. A local image that cannot be read is replaced by
 * a short placeholder so the exported page never shows a broken image icon.
 *
 * @param html        Complete standalone HTML document.
 * @param baseDir     Directory used for relative image paths.
 */
export async function embedLocalImages(
  html: string,
  baseDir: string
): Promise<EmbeddedImagesResult> {
  const cache = new Map<string, string | null>()
  const missing: string[] = []
  let embedded = 0

  const dataUrlFor = async (filePath: string): Promise<string | null> => {
    if (cache.has(filePath)) return cache.get(filePath) ?? null

    const extension = extname(filePath).slice(1).toLowerCase()
    const mime = IMAGE_MIME[extension]
    if (!mime) {
      cache.set(filePath, null)
      return null
    }

    try {
      const bytes = await readFile(filePath)
      const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`
      cache.set(filePath, dataUrl)
      return dataUrl
    } catch {
      cache.set(filePath, null)
      return null
    }
  }

  const matches = Array.from(html.matchAll(IMG_TAG))
  if (matches.length === 0) return { html, embedded: 0, missing }

  let result = ''
  let lastIndex = 0

  for (const match of matches) {
    const tag = match[0]
    const index = match.index ?? 0
    result += html.slice(lastIndex, index)
    lastIndex = index + tag.length

    const source = attributeValue(tag, SRC_ATTRIBUTE)
    const localPath = localPathFromSource(source)
    if (!localPath) {
      result += tag
      continue
    }

    const absolutePath = isAbsolute(localPath) ? localPath : resolve(baseDir, localPath)
    const dataUrl = await dataUrlFor(absolutePath)

    if (!dataUrl) {
      const name = basename(absolutePath)
      if (!missing.includes(name)) missing.push(name)
      const alt = attributeValue(tag, ALT_ATTRIBUTE)
      result += `<span class="missing-image">${alt ? `Image introuvable : ${alt}` : 'Image introuvable'}</span>`
      continue
    }

    embedded++
    result += tag.replace(SRC_ATTRIBUTE, `src="${dataUrl}"`)
  }

  result += html.slice(lastIndex)
  return { html: result, embedded, missing }
}
