import { access, copyFile, mkdir, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico'
}

export function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase()
  if (MIME_TO_EXTENSION[normalized]) return MIME_TO_EXTENSION[normalized]
  if (normalized.startsWith('image/')) return normalized.slice(6)
  return 'png'
}

function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '-')
  return cleaned || 'image'
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function uniqueTarget(assetsDir: string, filename: string): Promise<string> {
  const dot = filename.lastIndexOf('.')
  const base = dot > 0 ? filename.slice(0, dot) : filename
  const ext = dot > 0 ? filename.slice(dot) : ''

  let candidate = `${base}${ext}`
  let index = 1
  while (await exists(join(assetsDir, candidate))) {
    candidate = `${base}-${index}${ext}`
    index++
  }
  return join(assetsDir, candidate)
}

async function ensureAssetsDir(documentDir: string): Promise<string> {
  const assetsDir = join(documentDir, 'assets')
  await mkdir(assetsDir, { recursive: true })
  return assetsDir
}

function relativeAssetPath(absoluteTarget: string): string {
  return `assets/${basename(absoluteTarget)}`
}

/**
 * Copies a local image into `assets/` next to the document and returns the
 * path relative to the document directory (e.g. `assets/photo.png`), or `null`
 * on failure.
 */
export async function importImageFile(documentDir: string, sourcePath: string): Promise<string | null> {
  try {
    const assetsDir = await ensureAssetsDir(documentDir)

    // Already inside assets/ — reference it directly instead of duplicating.
    if (dirname(sourcePath) === assetsDir) return relativeAssetPath(sourcePath)

    const target = await uniqueTarget(assetsDir, sanitizeName(basename(sourcePath)))
    await copyFile(sourcePath, target)
    return relativeAssetPath(target)
  } catch {
    return null
  }
}

/**
 * Writes raw image bytes (e.g. a clipboard screenshot) into `assets/` next to
 * the document and returns the relative path, or `null` on failure.
 */
export async function importImageBuffer(
  documentDir: string,
  bytes: Uint8Array,
  mimeType: string
): Promise<string | null> {
  try {
    const assetsDir = await ensureAssetsDir(documentDir)
    const ext = extensionForMimeType(mimeType)
    const target = await uniqueTarget(assetsDir, `pasted-${Date.now()}.${ext}`)
    await writeFile(target, bytes)
    return relativeAssetPath(target)
  } catch {
    return null
  }
}
