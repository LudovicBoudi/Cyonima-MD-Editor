import type { UpdateChannel } from './types'

export interface ReleaseNoteEntry {
  version: string
  note?: string | null
}

/** Electron-updater channel names: `latest` is stable. */
export function updateChannelName(channel: UpdateChannel): string {
  return channel === 'beta' ? 'beta' : 'latest'
}

/** Turns update metadata release notes into plain, displayable text. */
export function releaseNotesText(
  notes: string | ReadonlyArray<ReleaseNoteEntry> | null | undefined
): string | null {
  if (!notes) return null
  const text =
    typeof notes === 'string'
      ? notes
      : notes.map((entry) => `${entry.version}\n${entry.note ?? ''}`).join('\n\n')
  const plain = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return plain || null
}
