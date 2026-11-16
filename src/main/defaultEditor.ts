import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { DefaultEditorResult } from '../shared/types'

export interface DefaultEditorDependencies {
  platform?: NodeJS.Platform
  /** Desktop entry identifier on Linux, usually `cyonima-md-editor.desktop`. */
  desktopId?: string
  /** Checks whether the desktop entry is installed before changing the default. */
  desktopInstalled?: () => boolean
  run?: (command: string, args: string[]) => Promise<unknown>
  openSettings?: (url: string) => Promise<unknown>
}

const WINDOWS_DEFAULT_APPS = 'ms-settings:defaultapps'
const MACOS_DEFAULT_APPS = 'x-apple.systempreferences:com.apple.Desktop-Settings.extension'

/** Finds the installed desktop entry in the XDG application directories. */
export function isDesktopEntryInstalled(
  desktopId: string,
  environment: NodeJS.ProcessEnv = process.env,
  home: string = homedir()
): boolean {
  const dataHome = environment['XDG_DATA_HOME'] || join(home, '.local', 'share')
  const dataDirs = (environment['XDG_DATA_DIRS'] || '/usr/local/share:/usr/share').split(':')
  return [dataHome, ...dataDirs].some((directory) =>
    existsSync(join(directory, 'applications', desktopId))
  )
}

/**
 * Makes the application the default Markdown editor where the OS allows it.
 * Linux accepts an explicit xdg-mime default; Windows and macOS require the
 * user to choose in their settings, so the relevant screen is opened instead
 * of silently changing anything.
 */
export async function configureDefaultEditor(
  dependencies: DefaultEditorDependencies = {}
): Promise<DefaultEditorResult> {
  const platform = dependencies.platform ?? process.platform

  if (platform === 'linux') {
    if (!dependencies.desktopId) return { status: 'manual' }
    // xdg-mime accepts a missing desktop file and writes a broken association:
    // refuse instead of leaving double-clicks pointing at nothing.
    if (dependencies.desktopInstalled && !dependencies.desktopInstalled()) {
      return { status: 'manual' }
    }
    const run = dependencies.run ?? (promisify(execFile) as DefaultEditorDependencies['run'])
    try {
      await run?.('xdg-mime', [
        'default',
        dependencies.desktopId,
        'text/markdown',
        'text/x-markdown'
      ])
      return { status: 'configured' }
    } catch (error) {
      return {
        status: 'manual',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  if (platform === 'win32' || platform === 'darwin') {
    const openSettings = dependencies.openSettings
    if (!openSettings) return { status: 'manual' }
    try {
      await openSettings(platform === 'win32' ? WINDOWS_DEFAULT_APPS : MACOS_DEFAULT_APPS)
      return { status: 'settings' }
    } catch (error) {
      return {
        status: 'manual',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  return { status: 'manual' }
}
