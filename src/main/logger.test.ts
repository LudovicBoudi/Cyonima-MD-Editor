import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getLogFilePath, initLogger, log } from './logger'

let userData: string

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'cyonima-logger-'))
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

function readLines(): string[] {
  const file = getLogFilePath()
  return readFileSync(file, 'utf8').trim().split('\n')
}

describe('logger', () => {
  it('creates the log file under userData', () => {
    const file = initLogger(userData)

    expect(file).toBe(join(userData, 'logs', 'app.log'))
    expect(existsSync(file)).toBe(true)
  })

  it('appends JSON lines with level, message and metadata', () => {
    initLogger(userData)
    log('error', 'Échec de lecture', { path: '/tmp/x.md' })

    const [entry] = readLines().map((line) => JSON.parse(line))
    expect(entry.level).toBe('error')
    expect(entry.message).toBe('Échec de lecture')
    expect(entry.meta).toEqual({ path: '/tmp/x.md' })
    expect(entry.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('appends entries in order', () => {
    initLogger(userData)
    log('info', 'premier')
    log('warn', 'second')

    const lines = readLines().map((line) => JSON.parse(line))
    expect(lines.map((entry) => entry.message)).toEqual(['premier', 'second'])
  })

  it('is a safe no-op before initialization', () => {
    expect(() => log('error', 'avant init')).not.toThrow()
  })
})
