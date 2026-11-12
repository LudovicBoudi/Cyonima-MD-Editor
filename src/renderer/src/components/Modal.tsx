import { createPortal } from 'react-dom'
import { useEffect, useRef } from 'react'
import type { FormEvent, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from 'react'
import { focusInitial, trapFocus } from '../lib/focus'

interface ModalProps {
  /** DOM id of the heading that names the dialog. */
  labelledBy: string
  /** Accessible role. `alertdialog` is used for destructive warnings. */
  role?: 'dialog' | 'alertdialog'
  /** Extra class applied to the dialog box itself (not the backdrop). */
  className?: string
  onClose: () => void
  closeOnBackdrop?: boolean
  /** Element to focus when the dialog opens; defaults to `[data-autofocus]`. */
  initialFocus?: RefObject<HTMLElement | null>
  /** Render the dialog as a form so Enter submits it. */
  as?: 'div' | 'form'
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  children: ReactNode
}

/**
 * Shared modal shell: portal to <body>, focus trap, focus restore, Escape and
 * an inert background. Several dialogs can be mounted at once (for example a
 * source-mode warning above the editor): only the topmost one handles keys.
 */

/** Open modals, innermost last. A plain array is enough: order is mount order. */
const stack: string[] = []
let nextId = 0

function syncBackgroundInert(): void {
  const root = document.getElementById('root')
  if (!root) return
  if (stack.length > 0) root.setAttribute('inert', '')
  else root.removeAttribute('inert')
}

export function Modal({
  labelledBy,
  role = 'dialog',
  className = '',
  onClose,
  closeOnBackdrop = true,
  initialFocus,
  as = 'div',
  onSubmit,
  children
}: ModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null)
  const idRef = useRef('')
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  if (!idRef.current) idRef.current = `modal-${nextId++}`

  useEffect(() => {
    const entry = idRef.current
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    stack.push(entry)
    syncBackgroundInert()
    focusInitial(dialogRef.current, initialFocus?.current ?? null)

    const onKeyDown = (event: KeyboardEvent) => {
      // Only the topmost modal reacts; lower ones stay inert.
      if (stack[stack.length - 1] !== entry) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }

      trapFocus(event, dialogRef.current)
    }

    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      const index = stack.lastIndexOf(entry)
      if (index >= 0) stack.splice(index, 1)
      syncBackgroundInert()

      // Never steal focus from a dialog that is still open above this one.
      if (stack.length === 0 && previouslyFocused?.isConnected) {
        previouslyFocused.focus()
      }
    }
    // Mount/unmount only: onClose is read through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const common = {
    ref: (node: HTMLElement | null) => {
      dialogRef.current = node
    },
    className: `dialog${className ? ` ${className}` : ''}`,
    role,
    'aria-modal': true,
    'aria-labelledby': labelledBy,
    tabIndex: -1,
    onMouseDown: (event: ReactMouseEvent) => event.stopPropagation()
  }

  const backdrop = (
    <div
      className="dialog-backdrop"
      onMouseDown={closeOnBackdrop ? onClose : undefined}
    >
      {as === 'form' ? (
        <form {...common} onSubmit={onSubmit}>
          {children}
        </form>
      ) : (
        <div {...common}>{children}</div>
      )}
    </div>
  )

  return createPortal(backdrop, document.body)
}
