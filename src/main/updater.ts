import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { ProgressInfo } from 'electron-updater'
import type { TranslationKey, TranslationParams } from '../shared/i18n'
import type { UpdateState } from '../shared/types'
import { releaseNotesText, updateChannelName } from '../shared/updates'
import type { AppSettings } from './settings'
import { log } from './logger'

const CHECK_DELAY_MS = 15_000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export interface UpdaterHooks {
  onState: (state: UpdateState) => void
  notify: (level: 'info' | 'warning' | 'error', message: string) => void
  onMenuChange: () => void
  t: (key: TranslationKey, params?: TranslationParams) => string
}

const initialState: UpdateState = {
  status: app.isPackaged ? 'idle' : 'disabled',
  currentVersion: app.getVersion(),
  availableVersion: null,
  releaseNotes: null,
  progress: null,
  error: null,
  channel: 'stable'
}

let state: UpdateState = initialState
let hooks: UpdaterHooks | null = null
let initialized = false
let checkTimer: NodeJS.Timeout | null = null
let checkInterval: NodeJS.Timeout | null = null
let manualCheck = false

function currentHooks(): UpdaterHooks | null {
  return hooks
}

function emit(patch: Partial<UpdateState>): UpdateState {
  const previousStatus = state.status
  state = { ...state, ...patch }
  currentHooks()?.onState(state)
  // Rebuilding the native menu on every download-progress tick would be
  // wasteful; only a status change can change the menu label.
  if (state.status !== previousStatus) currentHooks()?.onMenuChange()
  return state
}

function reportError(error: unknown, manual: boolean): void {
  const message = error instanceof Error ? error.message : String(error)
  log('warn', 'Mise à jour impossible', { message })
  emit({ status: 'error', error: message, progress: null })
  if (manual) currentHooks()?.notify('error', currentHooks()!.t('updates.error', { message }))
}

/** Installs the updater listeners once; safe to call before the window exists. */
export function initUpdater(options: UpdaterHooks): void {
  hooks = options
  if (initialized) return
  initialized = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = {
    info: (message) => log('info', String(message)),
    warn: (message) => log('warn', String(message)),
    error: (message) => log('error', String(message)),
    debug: (message) => log('info', String(message))
  }

  autoUpdater.on('checking-for-update', () => {
    emit({ status: 'checking', progress: null, error: null })
  })

  autoUpdater.on('update-available', (info) => {
    emit({
      status: 'available',
      availableVersion: info.version,
      releaseNotes: releaseNotesText(info.releaseNotes),
      progress: 0,
      error: null
    })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    emit({
      status: 'downloading',
      progress: Math.max(0, Math.min(100, progress.percent)),
      error: null
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    emit({
      status: 'downloaded',
      availableVersion: info.version,
      releaseNotes: releaseNotesText(info.releaseNotes) ?? state.releaseNotes,
      progress: 100,
      error: null
    })
    currentHooks()?.notify('info', currentHooks()!.t('updates.ready', { version: info.version }))
  })

  autoUpdater.on('update-not-available', () => {
    emit({ status: 'not-available', progress: null, error: null })
    if (manualCheck) currentHooks()?.notify('info', currentHooks()!.t('updates.upToDate'))
  })

  autoUpdater.on('error', (error) => {
    reportError(error, manualCheck)
    manualCheck = false
  })
}

/** Applies the update preferences and schedules automatic checks. */
export function configureUpdater(settings: Pick<AppSettings, 'autoUpdate' | 'updateChannel'>): void {
  state = { ...state, channel: settings.updateChannel }
  if (!app.isPackaged) {
    emit({ status: 'disabled', progress: null })
    return
  }

  autoUpdater.channel = updateChannelName(settings.updateChannel)
  autoUpdater.allowPrerelease = settings.updateChannel === 'beta'
  // A beta user can return to the stable channel even if stable is older.
  autoUpdater.allowDowngrade = settings.updateChannel === 'stable'

  if (checkTimer) {
    clearTimeout(checkTimer)
    checkTimer = null
  }
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }

  if (!settings.autoUpdate) return

  checkTimer = setTimeout(() => {
    void checkForUpdates(false)
  }, CHECK_DELAY_MS)
  checkInterval = setInterval(() => {
    void checkForUpdates(false)
  }, CHECK_INTERVAL_MS)
}

export function stopUpdater(): void {
  if (checkTimer) clearTimeout(checkTimer)
  if (checkInterval) clearInterval(checkInterval)
  checkTimer = null
  checkInterval = null
}

export function getUpdateState(): UpdateState {
  return state
}

/** Checks the configured feed. Downloads start automatically when available. */
export async function checkForUpdates(manual = false): Promise<UpdateState> {
  if (!app.isPackaged) {
    emit({ status: 'disabled', progress: null })
    if (manual) currentHooks()?.notify('info', currentHooks()!.t('updates.disabled'))
    return state
  }
  if (state.status === 'checking' || state.status === 'downloading') return state

  manualCheck = manual
  emit({ status: 'checking', progress: null, error: null })
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    reportError(error, manual)
  } finally {
    manualCheck = false
  }
  return state
}

/** Restarts the application and applies a downloaded update. */
export function installUpdate(): void {
  if (state.status !== 'downloaded') return
  autoUpdater.quitAndInstall(false, true)
}
