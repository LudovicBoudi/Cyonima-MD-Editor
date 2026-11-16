import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { configureDefaultEditor, isDesktopEntryInstalled } from './defaultEditor'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('configureDefaultEditor', () => {
  it('registers both Markdown MIME types with xdg-mime on Linux', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const result = await configureDefaultEditor({
      platform: 'linux',
      desktopId: 'cyonima-md-editor.desktop',
      run: async (command, args) => {
        calls.push({ command, args })
      }
    })

    expect(result).toEqual({ status: 'configured' })
    expect(calls).toEqual([
      {
        command: 'xdg-mime',
        args: ['default', 'cyonima-md-editor.desktop', 'text/markdown', 'text/x-markdown']
      }
    ])
  })

  it('refuses to write an association when the desktop entry is missing', async () => {
    let ran = false
    const result = await configureDefaultEditor({
      platform: 'linux',
      desktopId: 'cyonima-md-editor.desktop',
      desktopInstalled: () => false,
      run: async () => {
        ran = true
      }
    })

    expect(result).toEqual({ status: 'manual' })
    expect(ran).toBe(false)
  })

  it('finds a desktop entry in XDG_DATA_HOME or XDG_DATA_DIRS', () => {
    const dataHome = mkdtempSync(join(tmpdir(), 'cyonima-mime-home-'))
    const dataDir = mkdtempSync(join(tmpdir(), 'cyonima-mime-dir-'))
    temporaryDirectories.push(dataHome, dataDir)
    mkdirSync(join(dataDir, 'applications'), { recursive: true })
    writeFileSync(join(dataDir, 'applications', 'cyonima-md-editor.desktop'), '[Desktop Entry]\n')

    const environment = { XDG_DATA_HOME: dataHome, XDG_DATA_DIRS: dataDir }
    expect(isDesktopEntryInstalled('cyonima-md-editor.desktop', environment, dataHome)).toBe(true)
    expect(isDesktopEntryInstalled('other.desktop', environment, dataHome)).toBe(false)
  })

  it('falls back to manual instructions when xdg-mime fails', async () => {
    const result = await configureDefaultEditor({
      platform: 'linux',
      desktopId: 'cyonima-md-editor.desktop',
      run: async () => {
        throw new Error('xdg-mime: not found')
      }
    })

    expect(result).toMatchObject({ status: 'manual', error: 'xdg-mime: not found' })
  })

  it('opens the Windows default-apps settings instead of forcing a choice', async () => {
    const opened: string[] = []
    const result = await configureDefaultEditor({
      platform: 'win32',
      openSettings: async (url) => {
        opened.push(url)
      }
    })

    expect(result).toEqual({ status: 'settings' })
    expect(opened).toEqual(['ms-settings:defaultapps'])
  })

  it('opens the macOS settings screen', async () => {
    const opened: string[] = []
    const result = await configureDefaultEditor({
      platform: 'darwin',
      openSettings: async (url) => {
        opened.push(url)
      }
    })

    expect(result.status).toBe('settings')
    expect(opened[0]).toContain('x-apple.systempreferences:')
  })

  it('does nothing automatic on an unsupported platform', async () => {
    expect(await configureDefaultEditor({ platform: 'freebsd' })).toEqual({ status: 'manual' })
  })
})
