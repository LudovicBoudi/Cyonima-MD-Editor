import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { LogLevel } from '../shared/types'

let logFilePath = ''

/**
 * Prepares the local log directory and returns the log file path. Logging is
 * a no-op until this has been called.
 */
export function initLogger(userData: string): string {
  const directory = join(userData, 'logs')
  mkdirSync(directory, { recursive: true })
  logFilePath = join(directory, 'app.log')

  try {
    // Ensure the file exists so "Ouvrir le journal" always has a target.
    if (!existsSync(logFilePath)) appendFileSync(logFilePath, '')
  } catch {
    // Best effort.
  }

  return logFilePath
}

export function getLogFilePath(): string {
  return logFilePath
}

/**
 * Appends a JSON line to the local log. Synchronous so entries survive a
 * crash, and safe: a logging failure must never bring the app down.
 */
export function log(level: LogLevel, message: string, meta?: unknown): void {
  if (!logFilePath) return

  const entry = JSON.stringify({
    at: new Date().toISOString(),
    level,
    message,
    ...(meta === undefined ? {} : { meta })
  })

  try {
    appendFileSync(logFilePath, `${entry}\n`)
  } catch {
    // Best effort: never crash because of logging.
  }
}
