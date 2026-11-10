import type { NotifyLevel, NotifyPayload } from '../../../shared/types'

/** Renderer-only notifications, shown with the ones pushed by the main process. */
export const LOCAL_NOTIFY_EVENT = 'cyonima:notify'

export function notifyLocal(level: NotifyLevel, message: string): void {
  window.dispatchEvent(
    new CustomEvent<NotifyPayload>(LOCAL_NOTIFY_EVENT, {
      detail: { level, message, at: Date.now() }
    })
  )
}
