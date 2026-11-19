// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveStage, QUIET_AFTER_MS, endsAtLabel, orbFillFor, type LiveStageProps } from './live-stage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined
let host: HTMLDivElement
const primary = vi.fn()
const finish = vi.fn()
const cancel = vi.fn()
const base: LiveStageProps = {
  mode: 'still', state: 'running', eyebrow: 'Be Still · Meditate', title: 'Morning Sit', clock: '19:56', clockLabel: 'left', progress: 0.25,
  primary: { label: 'Pause', onClick: primary }, finish: { label: 'Close & Log', onClick: finish }, onCancel: cancel,
}
function render(over: Partial<LiveStageProps> = {}) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root!.render(<LiveStage {...base} {...over} />))
}
const stage = () => host.querySelector<HTMLElement>('[data-live-stage]')!
const button = (name: string) => [...host.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().startsWith(name))!
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); vi.useRealTimers() })

describe('the live stage (LIVE-2393)', () => {
  it('names the practice and style, reads the clock as one number and fills the bar by the progress (LIVE-2406)', () => {
    render()
    expect(host.querySelector('h1')!.textContent).toBe('Morning Sit · , Meditate')
    expect(host.querySelector('[role="timer"]')!.getAttribute('aria-label')).toBe('19:56 left')
    expect(host.querySelector<HTMLElement>('[data-live-bar] span')!.style.width).toBe('25%')
  })
  it('draws no bar while warming up or open-ended, and says to get settled', () => {
    render({ state: 'warmup', progress: null, clock: '3', clockLabel: 'Warm up' })
    expect(host.querySelector('[data-live-bar]')).toBeNull()
    expect(host.textContent).toContain('Get settled')
  })
  it('wires the three controls: the primary, the log and the cancel that does not log', () => {
    render()
    act(() => button('Pause').click()); expect(primary).toHaveBeenCalledTimes(1)
    act(() => button('Close & Log').click()); expect(finish).toHaveBeenCalledTimes(1)
    act(() => button('Cancel, don’t log').click()); expect(cancel).toHaveBeenCalledTimes(1)
  })
  it('Space presses the primary, but never while the member is typing', () => {
    render({ children: <textarea aria-label="Session note" /> })
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })) })
    expect(primary).toHaveBeenCalledTimes(1)
    act(() => { host.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })) })
    expect(primary).toHaveBeenCalledTimes(1)
  })
  it('steps the chrome back after a quiet stretch of a running session and wakes on a touch', () => {
    vi.useFakeTimers()
    render()
    expect(stage().dataset.quiet).toBeUndefined()
    act(() => { vi.advanceTimersByTime(QUIET_AFTER_MS + 50) })
    expect(stage().dataset.quiet).toBe('true')
    act(() => { document.dispatchEvent(new Event('pointermove')) })
    expect(stage().dataset.quiet).toBeUndefined()
  })
  it('never goes quiet while paused, so the way back in stays lit', () => {
    vi.useFakeTimers()
    render({ state: 'paused', primary: { label: 'Resume', onClick: primary } })
    act(() => { vi.advanceTimersByTime(QUIET_AFTER_MS * 3) })
    expect(stage().dataset.quiet).toBeUndefined()
  })
  it('names a Get Moving phase and its round, and wears the move accent', () => {
    render({ mode: 'move', eyebrow: 'Get Moving · Strength', clockLabel: 'Work', accent: 'work', rounds: { current: 3, total: 8 } })
    expect(host.querySelector('[data-rounds]')!.textContent).toBe('Round 3 of 8')
    expect(host.textContent).toContain('Work')
    expect(button('Pause').style.background).toContain('--color-move')
    expect(orbFillFor('move')).toContain('--color-move')
    expect(orbFillFor('still')).toBe('var(--design-practice-orb)')
  })
  it('says when a running session ends, in the member’s own clock', () => {
    render({ remainingSec: 600 })
    expect(host.textContent).toMatch(/Ends \d{1,2}:\d{2}/)
    expect(endsAtLabel(new Date(2026, 10, 18, 18, 30).getTime(), 720)).toMatch(/6:42/)
  })
})
