import { afterEach, describe, expect, it } from 'vitest'
import {
  focusEdge,
  focusInitial,
  focusStep,
  getFocusableElements,
  trapFocus
} from './focus'

function fixture(): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = `
    <button id="first">Premier</button>
    <button id="disabled" disabled>Désactivé</button>
    <button id="hidden" aria-hidden="true">Caché</button>
    <input id="input" />
    <div id="negative" tabindex="-1">Hors tabulation</div>
    <div id="custom" tabindex="0">Personnalisé</div>
    <button id="last">Dernier</button>
  `
  document.body.append(root)
  return root
}

function tabEvent(shiftKey = false): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('getFocusableElements', () => {
  it('returns enabled, visible focusable elements in DOM order', () => {
    const root = fixture()
    expect(getFocusableElements(root).map((element) => element.id)).toEqual([
      'first',
      'input',
      'custom',
      'last'
    ])
  })

  it('ignores elements inside an inert subtree', () => {
    const root = fixture()
    root.setAttribute('inert', '')
    expect(getFocusableElements(root)).toEqual([])
  })

  it('returns an empty list without a container', () => {
    expect(getFocusableElements(null)).toEqual([])
  })
})

describe('trapFocus', () => {
  it('wraps from the last element to the first with Tab', () => {
    const root = fixture()
    const last = root.querySelector<HTMLElement>('#last')
    last?.focus()
    const event = tabEvent()
    expect(trapFocus(event, root)).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement?.id).toBe('first')
  })

  it('wraps from the first element to the last with Shift+Tab', () => {
    const root = fixture()
    root.querySelector<HTMLElement>('#first')?.focus()
    const event = tabEvent(true)
    expect(trapFocus(event, root)).toBe(true)
    expect(document.activeElement?.id).toBe('last')
  })

  it('leaves movement inside the container to the browser', () => {
    const root = fixture()
    root.querySelector<HTMLElement>('#input')?.focus()
    const event = tabEvent()
    expect(trapFocus(event, root)).toBe(false)
    expect(event.defaultPrevented).toBe(false)
  })

  it('pulls focus back into the container when it escaped', () => {
    const root = fixture()
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    expect(trapFocus(tabEvent(), root)).toBe(true)
    expect(document.activeElement?.id).toBe('first')
  })

  it('focuses the container itself when there is nothing focusable', () => {
    const root = document.createElement('div')
    root.tabIndex = -1
    document.body.append(root)
    const event = tabEvent()
    expect(trapFocus(event, root)).toBe(true)
    expect(document.activeElement).toBe(root)
  })
})

describe('focusStep and focusEdge', () => {
  it('cycles forward and wraps', () => {
    const root = fixture()
    const last = root.querySelector<HTMLElement>('#last')
    expect(focusStep(root, last, 1)?.id).toBe('first')
  })

  it('cycles backward and wraps', () => {
    const root = fixture()
    const first = root.querySelector<HTMLElement>('#first')
    expect(focusStep(root, first, -1)?.id).toBe('last')
  })

  it('uses the first or last element when none is current', () => {
    const root = fixture()
    expect(focusStep(root, null, 1)?.id).toBe('first')
    expect(focusStep(root, null, -1)?.id).toBe('last')
  })

  it('focuses the requested edge', () => {
    const root = fixture()
    expect(focusEdge(root, 'first')?.id).toBe('first')
    expect(focusEdge(root, 'last')?.id).toBe('last')
  })
})

describe('focusInitial', () => {
  it('prefers the explicit element', () => {
    const root = fixture()
    const input = root.querySelector<HTMLElement>('#input')
    expect(focusInitial(root, input)?.id).toBe('input')
    expect(document.activeElement?.id).toBe('input')
  })

  it('prefers the data-autofocus element', () => {
    const root = fixture()
    root.querySelector('#custom')?.setAttribute('data-autofocus', '')
    expect(focusInitial(root)?.id).toBe('custom')
  })

  it('falls back to the first focusable element, then the container', () => {
    const root = fixture()
    expect(focusInitial(root)?.id).toBe('first')

    const empty = document.createElement('div')
    empty.tabIndex = -1
    document.body.append(empty)
    expect(focusInitial(empty)).toBe(empty)
    expect(document.activeElement).toBe(empty)
  })
})
