// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { load, refresh } = vi.hoisted(() => ({ load: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/app/(main)/on-air/actions', () => ({ loadOnAirSession: load }))
vi.mock('@/app/(main)/on-air/timer-session-actions', () => ({ getActiveTimerSession: async () => ({ data: null }) }))
vi.mock('@/lib/fullscreen', () => ({ requestAppFullscreen: async () => {}, exitAppFullscreen: async () => {} }))
vi.mock('./session', () => ({ OnAirSession: () => <div data-testid="still-session">Running sit</div> }))
vi.mock('./movement-session', () => ({ MovementSession: () => <div data-testid="move-session">Running movement</div> }))

import { MindlessProvider, useMindless } from './mindless'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root
let container: HTMLDivElement
function Open() {
  const timer = useMindless()
  return <button onClick={() => timer.open({ practiceId: 'p', autoStart: true })}>Open timer</button>
}
function OpenSetup() {
  const timer = useMindless()
  return <button onClick={() => timer.open()}>Open setup</button>
}
async function open() {
  await act(async () => root.render(<MindlessProvider><Open /></MindlessProvider>))
  await act(async () => container.querySelector('button')!.click())
}
function escape() {
  return act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
}
beforeEach(() => {
  window.localStorage.clear()
  load.mockReset()
  refresh.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe('Mindless escape ownership', () => {
  it.each([['mindless', 'still-session'], ['movement', 'move-session']])('does not destroy %s when a nested popup handles Escape', async (timerKind, testId) => {
    load.mockResolvedValue({ data: { practices: [{ id: 'p', timerKind }], defaultPracticeId: 'p', prefs: {} } })
    await open()
    expect(container.querySelector(`[data-testid="${testId}"]`)).not.toBeNull()
    await escape()
    expect(container.querySelector(`[data-testid="${testId}"]`)).not.toBeNull()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('contains keyboard focus in setup and restores the trigger and scroll on Escape', async () => {
    load.mockResolvedValue({ data: { practices: [{ id: 'p', title: 'Reflect', timerKind: 'mindless', durationMin: 5 }], defaultPracticeId: 'p', prefs: {} } })
    const rects = vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 10, height: 10 }] as unknown as DOMRectList)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'clip'
    await act(async () => root.render(<MindlessProvider><OpenSetup /></MindlessProvider>))
    const trigger = container.querySelector('button')!
    trigger.focus()
    await act(async () => trigger.click())
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Tune out')
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])'))
    controls.at(-1)!.focus()
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })) })
    expect(document.activeElement).toBe(controls[0])
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })) })
    expect(document.activeElement).toBe(controls.at(-1))
    await escape()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(document.body.style.overflow).toBe('clip')
    document.body.style.overflow = originalOverflow
    rects.mockRestore()
  })

  it('still lets Escape dismiss an outstanding load', async () => {
    load.mockImplementation(() => new Promise(() => {}))
    await open()
    expect(container.textContent).toContain('Settling in')
    await escape()
    expect(container.textContent).not.toContain('Settling in')
    expect(refresh).toHaveBeenCalledOnce()
  })
})
