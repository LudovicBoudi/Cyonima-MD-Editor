import { _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { resolve } from 'node:path'

const PROJECT_ROOT = resolve(process.cwd())

export interface LaunchedApp {
  app: ElectronApplication
  page: Page
}

export interface LaunchOptions {
  /** Isolated Electron profile; tests create one and remove it afterwards. */
  profile: string
  /** Markdown file passed as the first application argument. */
  file?: string
  env?: Record<string, string>
}

/** Launches the built application and waits until the editor is mounted. */
export async function launchApp(options: LaunchOptions): Promise<LaunchedApp> {
  const args = ['--no-sandbox', PROJECT_ROOT]
  if (options.file) args.push(options.file)

  const app = await electron.launch({
    args,
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      CYONIMA_USER_DATA: options.profile,
      ...options.env
    } as Record<string, string>
  })

  const page = await app.firstWindow()
  await page.waitForSelector('.md-editor', { timeout: 30_000 })
  return { app, page }
}

/** Sends the same action the native menu sends to the focused window. */
export async function sendMenuAction(app: ElectronApplication, action: string): Promise<void> {
  await app.evaluate(({ BrowserWindow }, value) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('menu:action', value)
  }, action)
}

/** Replaces the native open dialog for the next call. */
export async function stubOpenDialog(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(({ dialog }, value) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [value] })
  }, filePath)
}

/** Replaces the native save dialog for the next call. */
export async function stubSaveDialog(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(({ dialog }, value) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: value })
  }, filePath)
}

/** Makes the next synchronous message box return the given button index. */
export async function stubMessageBox(app: ElectronApplication, response: number): Promise<void> {
  await app.evaluate(({ dialog }, value) => {
    dialog.showMessageBoxSync = () => value
  }, response)
}
