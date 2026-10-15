// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompactSetup, setupPractices } from './compact-setup'
import type { OnAirPractice } from './session'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const practices = [
  { id: 'sit', title: 'Reflect', timerKind: 'mindless', durationMin: 17, loggedToday: true },
  { id: 'free', title: 'Free Practice', timerKind: 'mindless', logsAs: 'sit' },
  { id: 'move', title: 'Walk', timerKind: 'movement', durationMin: 22, movementConfig: { mode: 'walk' } },
  { id: 'free-move', title: 'Free Practice', timerKind: 'movement', logsAs: 'move' },
] as OnAirPractice[]
let root: Root | undefined
let host: HTMLDivElement
const start = vi.fn()
function render(initialMode: 'still' | 'move' = 'still', initialPracticeId = 'sit') {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root!.render(<CompactSetup practices={practices} initialMode={initialMode} initialPracticeId={initialPracticeId} onStart={start} onAdvanced={vi.fn()} onClose={vi.fn()} />))
}
afterEach(() => { act(() => root?.unmount()); host?.remove(); start.mockClear() })
describe('one shared compact setup', () => {
  it('offers one free practice for the current mode, retaining the real adopted entry', () => {
    expect(setupPractices([...practices, { ...practices[1], id: 'duplicate' }], 'still').map((p) => p.id)).toEqual(['sit', 'free'])
  })
  it('quick-starts a completed adopted practice without changing its authored duration', () => {
    render()
    const button = host.querySelector<HTMLButtonElement>('[aria-label="Start Reflect"]')!
    expect(button.textContent).toContain('17 min')
    expect(button.textContent).toContain('Start again')
    act(() => button.click())
    expect(start).toHaveBeenCalledWith({ practiceId: 'sit', mode: 'still' })
  })
  it.each(['still', 'move'] as const)('custom %s duration is validated and forwarded without resuming/logging', (mode) => {
    render(mode, mode === 'move' ? 'free-move' : 'free')
    const input = host.querySelector('input')!
    const update = (value: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
    const begin = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Start timer')!
    update('0'); expect(begin.disabled).toBe(true)
    update('13'); expect(begin.disabled).toBe(false)
    act(() => begin.click())
    expect(start).toHaveBeenCalledWith({ practiceId: mode === 'move' ? 'free-move' : 'free', mode, minutesOverride: 13 })
  })
  it('keeps locked authored lengths and log-only semantics out of custom overrides', () => {
    practices[0].durationLocked = true
    render()
    expect(host.querySelector('input')!.disabled).toBe(true)
    const begin = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Start timer')!
    act(() => begin.click())
    expect(start).toHaveBeenCalledWith({ practiceId: 'sit', mode: 'still' })
    practices[0].durationLocked = false
  })
  it('switches modes with one free entry and the correct selected authored movement length', () => {
    render()
    const moving = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent?.includes('Get Moving'))!
    act(() => moving.click())
    expect(moving.getAttribute('aria-selected')).toBe('true')
    expect(host.querySelectorAll('[aria-label="Start Free Practice"]')).toHaveLength(1)
    expect(host.querySelector('[aria-label="Start Walk"]')?.textContent).toContain('22 min')
  })
})
