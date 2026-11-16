// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
import { LiveRefresh } from './live-refresh'

let root: Root
let container: HTMLDivElement
let visible = true
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.refresh.mockClear()
  visible = true
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visible ? 'visible' : 'hidden' })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => !visible })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === label)!
const tick = () => act(async () => vi.advanceTimersByTime(60_000))

describe('live growth refresh controls', () => {
  it('offers recovery without inventing a computed timestamp when the last reading is unavailable', async () => {
    await act(async () => root.render(<LiveRefresh at={null} />))
    expect(container.textContent).toContain('No successful growth reading yet')
    expect(container.textContent).not.toContain('Reading computed')
    await act(async () => button('Refresh now').click())
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    await tick()
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
  })
  it('stops background polling and exposes why it is paused', async () => {
    await act(async () => root.render(<LiveRefresh at="2026-11-12T23:00:00Z" />))
    await tick()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    await act(async () => { visible = false; document.dispatchEvent(new Event('visibilitychange')) })
    await tick()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('paused while this tab is hidden')
    await act(async () => { visible = true; document.dispatchEvent(new Event('visibilitychange')) })
    await tick()
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
  })
  it('lets an operator pause automatic work while retaining manual refresh', async () => {
    await act(async () => root.render(<LiveRefresh at="2026-11-12T23:00:00Z" />))
    await act(async () => button('Pause').click())
    await tick()
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(button('Resume').getAttribute('aria-pressed')).toBe('true')
    await act(async () => button('Refresh now').click())
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    await act(async () => button('Resume').click())
    await tick()
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
  })
})
