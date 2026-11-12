import type { ElectronApi } from '../../src/shared/types'

declare global {
  interface Window {
    api: ElectronApi
  }
}

export {}
