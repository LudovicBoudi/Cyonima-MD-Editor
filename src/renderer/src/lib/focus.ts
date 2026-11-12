/**
 * Keyboard focus helpers shared by dialogs, toolbars, tabs and menus.
 *
 * They are deliberately framework-free so the behaviour can be unit tested
 * without mounting React components.
 */

/** Elements that can receive keyboard focus inside a container. */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

/**
 * Focusable elements in DOM order. Disabled controls, elements hidden from
 * assistive technology and anything inside an inert subtree are left out.
 */
export function getFocusableElements(container: ParentNode | null): HTMLElement[] {
  if (!container) return []
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-hidden') !== 'true' &&
      element.getAttribute('tabindex') !== '-1' &&
      !element.closest('[inert]')
  )
}

/**
 * Keeps Tab and Shift+Tab inside `container`. Returns true when the movement
 * was handled (and the default browser behaviour must be prevented).
 */
export function trapFocus(event: KeyboardEvent, container: HTMLElement | null): boolean {
  if (event.key !== 'Tab') return false

  const items = getFocusableElements(container)
  if (items.length === 0) {
    event.preventDefault()
    container?.focus()
    return true
  }

  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement as HTMLElement | null
  const inside = active !== null && container?.contains(active) === true

  if (event.shiftKey) {
    if (!inside || active === first) {
      event.preventDefault()
      last.focus()
      return true
    }
    return false
  }

  if (!inside || active === last) {
    event.preventDefault()
    first.focus()
    return true
  }
  return false
}

/**
 * Moves focus `step` places from `current` inside `container`, wrapping around
 * both ends. Returns the element that received focus, if any.
 */
export function focusStep(
  container: ParentNode | null,
  current: Element | null,
  step: number
): HTMLElement | null {
  const items = getFocusableElements(container)
  if (items.length === 0) return null

  const index = current ? items.indexOf(current as HTMLElement) : -1
  let next: number
  if (index < 0) next = step > 0 ? 0 : items.length - 1
  else next = (index + step + items.length) % items.length

  const target = items[next]
  target.focus()
  return target
}

/** Moves focus to the first or last focusable element of `container`. */
export function focusEdge(
  container: ParentNode | null,
  edge: 'first' | 'last'
): HTMLElement | null {
  const items = getFocusableElements(container)
  if (items.length === 0) return null
  const target = edge === 'first' ? items[0] : items[items.length - 1]
  target.focus()
  return target
}

/**
 * Focuses the best initial target: an explicit element, the one marked with
 * `data-autofocus`, the first focusable child, or the container itself.
 */
export function focusInitial(
  container: HTMLElement | null,
  preferred?: HTMLElement | null
): HTMLElement | null {
  const marked = container?.querySelector<HTMLElement>('[data-autofocus]') ?? null
  const target = preferred ?? marked ?? getFocusableElements(container)[0] ?? container
  target?.focus()
  return target
}
