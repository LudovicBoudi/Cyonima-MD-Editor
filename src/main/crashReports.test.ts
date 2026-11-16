import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_CRASH_REPORTS,
  buildCrashReport,
  crashReportsDirectory,
  sanitizeCrashText,
  writeCrashReport
} from './crashReports'

const METADATA = {
  appVersion: '0.1.0',
  platform: 'linux' as const,
  arch: 'x64',
  versions: { electron: '39.0.0', chromium: '142.0.0', node: '22.0.0' }
}

let userData: string

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'cyonima-crash-'))
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

describe('sanitizeCrashText', () => {
  it('redacts Unix and Windows paths', () => {
    expect(sanitizeCrashText('Cannot read /home/alice/notes.md')).toBe(
      'Cannot read <path>'
    )
    expect(sanitizeCrashText('Cannot read C:\\Users\\alice\\notes.md')).toBe(
      'Cannot read <path>'
    )
    expect(sanitizeCrashText('Could not open notes.md')).toBe('Could not open <file>')
  })

  it('redacts file URLs, web URLs and emails', () => {
    expect(
      sanitizeCrashText('file:///home/alice/a.md https://example.com/x alice@example.com')
    ).toBe('<path> <url> <email>')
  })

  it('keeps ordinary diagnostic text and bounds its length', () => {
    expect(sanitizeCrashText('TypeError: x is undefined')).toBe(
      'TypeError: x is undefined'
    )
    expect(sanitizeCrashText('a'.repeat(50), 10)?.length).toBe(10)
    expect(sanitizeCrashText('')).toBeUndefined()
  })
})

describe('buildCrashReport', () => {
  it('keeps only sanitized metadata and error fields', () => {
    const report = buildCrashReport(
      {
        source: 'renderer',
        name: 'Error',
        message: 'Failed to read /home/alice/secret.md',
        stack: 'Error: failed\n    at /home/alice/app.ts:1:1',
        componentStack: 'at Editor (/home/alice/Editor.tsx:2:2)',
        reason: 'boom',
        exitCode: 1
      },
      METADATA,
      new Date('2026-11-16T10:00:00.000Z'),
      'crash-1'
    )

    expect(report).toMatchObject({
      id: 'crash-1',
      at: '2026-11-16T10:00:00.000Z',
      source: 'renderer',
      appVersion: '0.1.0',
      platform: 'linux',
      arch: 'x64',
      exitCode: 1
    })
    expect(report.message).toContain('<path>')
    expect(report.stack).toContain('<path>')
    expect(report.componentStack).toContain('<path>')
    expect(JSON.stringify(report)).not.toContain('/home/alice')
  })
})

describe('writeCrashReport', () => {
  it('writes a report and keeps at most the newest 20', () => {
    for (let index = 0; index < MAX_CRASH_REPORTS + 2; index++) {
      const report = buildCrashReport(
        { source: 'main', message: `failure ${index}` },
        METADATA,
        new Date(),
        `crash-${index}`
      )
      writeCrashReport(userData, report)
      // Make the modification times distinct enough for deterministic pruning.
      const path = join(crashReportsDirectory(userData), `crash-${index}.json`)
      writeFileSync(path, JSON.stringify(report))
    }

    expect(readdirSync(crashReportsDirectory(userData))).toHaveLength(MAX_CRASH_REPORTS)
  })

  it('creates the folder on demand', () => {
    const report = buildCrashReport({ source: 'main', message: 'boom' }, METADATA)
    const path = writeCrashReport(userData, report)
    expect(path).toContain(crashReportsDirectory(userData))
  })
})
