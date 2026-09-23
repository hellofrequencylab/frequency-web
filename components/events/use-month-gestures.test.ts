// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement, type RefObject } from 'react'
import { createRoot } from 'react-dom/client'
import { useMonthGestures, verticalScrollTaker } from './use-month-gestures'

/** Mount the hook on a throwaway root, the way this repo's other render tests do. */
function mountHook(grid: HTMLElement, onStep: (d: 1 | -1) => void) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const ref = { current: grid } as RefObject<HTMLElement | null>
  function Probe() {
    useMonthGestures(ref, onStep, { vertical: true })
    return null
  }
  const root = createRoot(host)
  act(() => {
    root.render(createElement(Probe))
  })
  return () => act(() => root.unmount())
}

/** jsdom does no layout, so a scroller has to be told its own size. */
function makeScrollable(el: HTMLElement, { scrollHeight = 1000, clientHeight = 300, scrollTop = 0 } = {}) {
  el.style.overflowY = 'auto'
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
  Object.defineProperty(el, 'scrollTop', { value: scrollTop, writable: true, configurable: true })
}

/** The real shape when the console is open: the scroll container is portaled in ABOVE the grid,
 *  so it is an ANCESTOR of the grid and a DESCENDANT of the console root. */
function consoleTree() {
  const root = document.createElement('div')
  root.setAttribute('data-calendar-console', '')
  const scroller = document.createElement('div')
  const grid = document.createElement('div')
  const cell = document.createElement('div')
  grid.appendChild(cell)
  scroller.appendChild(grid)
  root.appendChild(scroller)
  document.body.appendChild(root)
  return { root, scroller, grid, cell }
}

function wheel(target: Element, deltaY: number) {
  target.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }))
}

describe('verticalScrollTaker', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('sees a scroller ABOVE the grid when the boundary is the console root', () => {
    const { root, scroller, cell } = consoleTree()
    makeScrollable(scroller)
    expect(verticalScrollTaker(cell, 1, root)).toBe(true)
  })

  it('cannot see that same scroller when the boundary is the grid -- the old bug', () => {
    const { scroller, grid, cell } = consoleTree()
    makeScrollable(scroller)
    expect(verticalScrollTaker(cell, 1, grid)).toBe(false)
  })

  it('gives the month back once the scroller has run out of room', () => {
    const { root, scroller, cell } = consoleTree()
    makeScrollable(scroller, { scrollHeight: 1000, clientHeight: 300, scrollTop: 700 })
    expect(verticalScrollTaker(cell, 1, root)).toBe(false)
  })
})

describe('useMonthGestures vertical wheel', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('does NOT page the month while the console above the grid can still scroll', () => {
    const { scroller, grid, cell } = consoleTree()
    makeScrollable(scroller)
    const onStep = vi.fn()
    const unmount = mountHook(grid, onStep)

    wheel(cell, 120) // comfortably past STEP_PX (60)
    expect(onStep).not.toHaveBeenCalled()
    unmount()
  })

  it('pages the month once that scroller is at its end', () => {
    const { scroller, grid, cell } = consoleTree()
    makeScrollable(scroller, { scrollHeight: 1000, clientHeight: 300, scrollTop: 700 })
    const onStep = vi.fn()
    const unmount = mountHook(grid, onStep)

    wheel(cell, 120)
    expect(onStep).toHaveBeenCalledWith(1)
    unmount()
  })
})
