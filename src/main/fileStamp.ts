/**
 * Lightweight fingerprint of a file on disk, used to detect changes made
 * outside the editor. Modification time and size are enough to catch the vast
 * majority of external edits without re-reading the content.
 */
export interface FileStamp {
  mtimeMs: number
  size: number
}

export function stampChanged(a: FileStamp | null, b: FileStamp | null): boolean {
  if (a === null || b === null) return a !== b
  return a.mtimeMs !== b.mtimeMs || a.size !== b.size
}
