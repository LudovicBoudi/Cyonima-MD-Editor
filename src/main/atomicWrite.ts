import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { access, chmod, lstat, open, realpath, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code
}

/**
 * Follows a symlink so the link itself is preserved instead of being replaced
 * by a regular file when the temporary file is renamed.
 */
async function resolveTarget(filePath: string): Promise<string> {
  try {
    const info = await lstat(filePath)
    if (info.isSymbolicLink()) return await realpath(filePath)
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error
  }
  return filePath
}

/**
 * Best-effort directory sync so the rename survives a power loss. Not all
 * platforms or filesystems support opening a directory this way.
 */
async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === 'win32') return

  let handle: FileHandle | undefined
  try {
    handle = await open(directory, 'r')
    await handle.sync()
  } catch {
    // Durability is best-effort; the file itself is already synced.
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

function friendlyError(error: unknown, name: string): Error {
  const known = error instanceof Error ? error : new Error(String(error))
  if (!errorCode(error)) return known

  switch (errorCode(error)) {
    case 'EACCES':
    case 'EPERM':
      return new Error(
        `Droits insuffisants pour enregistrer « ${name} ». ` +
          'Vérifiez les permissions du fichier ou du dossier, ou utilisez « Enregistrer sous ».'
      )
    case 'EROFS':
      return new Error(`« ${name} » se trouve sur un système de fichiers en lecture seule.`)
    case 'ENOSPC':
      return new Error(`Espace disque insuffisant pour enregistrer « ${name} ».`)
    case 'EISDIR':
      return new Error(`« ${name} » est un dossier : impossible de l’enregistrer comme fichier.`)
    default:
      return known
  }
}

/**
 * Writes a document atomically: the content goes to a temporary file in the
 * same directory, is flushed to disk, then renamed over the target. A crash or
 * power loss can leave the temporary file behind, but never a truncated
 * document.
 *
 * Existing permissions and symlinks are preserved.
 */
export async function writeFileAtomic(filePath: string, data: Uint8Array): Promise<void> {
  const targetPath = await resolveTarget(filePath)
  let mode: number | undefined

  try {
    const info = await stat(targetPath)
    if (!info.isFile()) {
      throw new Error(`« ${basename(targetPath)} » n’est pas un fichier : impossible de l’enregistrer.`)
    }

    mode = info.mode & 0o777
    try {
      await access(targetPath, constants.W_OK)
    } catch {
      throw new Error(
        `« ${basename(targetPath)} » est en lecture seule ou n’est pas accessible en écriture. ` +
          'Modifiez ses permissions ou utilisez « Enregistrer sous ».'
      )
    }
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error
  }

  const directory = dirname(targetPath)
  const tempPath = join(
    directory,
    `.${basename(targetPath)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  )
  let handle: FileHandle | undefined

  try {
    handle = await open(tempPath, 'wx', mode ?? 0o666)
    await handle.writeFile(data)
    await handle.sync()
    await handle.close()
    handle = undefined

    // `open` applies the umask; restore the exact original mode when replacing.
    if (mode !== undefined) await chmod(tempPath, mode)

    await rename(tempPath, targetPath)
    await syncDirectory(directory)
  } catch (error) {
    await handle?.close().catch(() => undefined)
    await rm(tempPath, { force: true }).catch(() => undefined)
    throw friendlyError(error, basename(targetPath))
  }
}
