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

  it('still lets Escape dismiss an outstanding load', async () => {
    load.mockImplementation(() => new Promise(() => {}))
    await open()
    expect(container.textContent).toContain('Settling in')
    await escape()
    expect(container.textContent).not.toContain('Settling in')
    expect(refresh).toHaveBeenCalledOnce()
  })
})
