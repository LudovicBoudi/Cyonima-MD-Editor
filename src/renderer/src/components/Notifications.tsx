import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import type { NotifyLevel, NotifyPayload } from '../../../shared/types'
import { LOCAL_NOTIFY_EVENT } from '../lib/notify'

interface Toast extends NotifyPayload {
  id: number
}

const ICONS: Record<NotifyLevel, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle
}

const DISMISS_MS = 6000
const MAX_TOASTS = 4

/**
 * Non-blocking notifications pushed from the main process (errors, warnings,
 * confirmations). They disappear on their own and never interrupt typing.
 */
export function Notifications() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  useEffect(() => {
    const show = (payload: NotifyPayload) => {
      const id = ++idRef.current
      setToasts((list) => [...list.slice(-(MAX_TOASTS - 1)), { ...payload, id }])
      window.setTimeout(() => {
        setToasts((list) => list.filter((toast) => toast.id !== id))
      }, DISMISS_MS)
    }

    const unsubscribe = window.api.onNotify(show)
    const onLocal = (event: Event) => show((event as CustomEvent<NotifyPayload>).detail)
    window.addEventListener(LOCAL_NOTIFY_EVENT, onLocal)
    return () => {
      unsubscribe()
      window.removeEventListener(LOCAL_NOTIFY_EVENT, onLocal)
    }
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id))
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="toast-region" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.level]
        return (
          <div key={toast.id} className={`toast toast--${toast.level}`} role="status">
            <Icon className="toast-icon" size={16} strokeWidth={2} aria-hidden="true" />
            <span className="toast-message">{toast.message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismiss(toast.id)}
              aria-label="Fermer la notification"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
