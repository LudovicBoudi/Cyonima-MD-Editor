import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import type { CrashReportInput } from '../shared/types'

export const MAX_CRASH_REPORTS = 20

export interface CrashMetadata {
  appVersion: string
  platform: NodeJS.Platform
  arch: string
  versions: {
    electron: string
    chromium: string
    node: string
  }
}

export interface CrashReport extends CrashMetadata {
  id: string
  at: string
  source: CrashReportInput['source']
  name?: string
  message?: string
  stack?: string
  componentStack?: string
  reason?: string
  exitCode?: number
}

export function crashReportsDirectory(userData: string): string {
  return join(userData, 'crash-reports')
}

/**
 * Removes paths, file URLs and account identifiers from crash metadata.
 * Document content is never added by the reporter; this also makes sure an
 * error message cannot accidentally leak a path that identifies the user.
 */
export function sanitizeCrashText(value: string | undefined, maxLength = 4000): string | undefined {
  if (typeof value !== 'string' || !value) return undefined
  const sanitized = value
    .replace(/\bfile:\/\/[^\s"'<>]+/gi, '<path>')
    .replace(/\bhttps?:\/\/[^\s"'<>]+/gi, '<url>')
    .replace(/\b[A-Za-z]:\\[^\s"'<>]+/g, '<path>')
    .replace(/(^|[\s("'=:[])\/(?:[^/\s"'<>]+\/?)+/g, '$1<path>')
    .replace(/\b[\w.-]+\.(?:md|markdown|mdown|mkd|txt)\b/gi, '<file>')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '<email>')
    .trim()
    .slice(0, maxLength)
  return sanitized || undefined
}

export function buildCrashReport(
  input: CrashReportInput,
  metadata: CrashMetadata,
  now = new Date(),
  id: string = randomUUID()
): CrashReport {
  return {
    id,
    at: now.toISOString(),
    ...metadata,
    source: input.source,
    name: sanitizeCrashText(input.name, 120),
    message: sanitizeCrashText(input.message, 1000),
    stack: sanitizeCrashText(input.stack, 4000),
    componentStack: sanitizeCrashText(input.componentStack, 2000),
    reason: sanitizeCrashText(input.reason, 300),
    exitCode: typeof input.exitCode === 'number' ? input.exitCode : undefined
  }
}

/** Writes a report synchronously so it survives a crash, then keeps the newest 20. */
export function writeCrashReport(userData: string, report: CrashReport): string {
  const directory = crashReportsDirectory(userData)
  mkdirSync(directory, { recursive: true })
  const file = join(directory, `${report.id}.json`)
  writeFileSync(file, JSON.stringify(report, null, 2), 'utf8')

  try {
    const files = readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        const path = join(directory, name)
        return { path, mtime: statSync(path).mtimeMs }
      })
      .sort((a, b) => a.mtime - b.mtime)
    for (const old of files.slice(0, Math.max(0, files.length - MAX_CRASH_REPORTS))) {
      rmSync(old.path, { force: true })
    }
  } catch {
    // Pruning is best effort; the report itself was written.
  }

  return file
}
