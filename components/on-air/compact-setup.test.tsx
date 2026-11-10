// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompactSetup, setupPractices } from './compact-setup'
import type { OnAirPractice } from './session'
const saveOnAirPrefs = vi.fn(async () => ({ ok: true, data: null }))
vi.mock('@/app/(main)/on-air/actions', () => ({ saveOnAirPrefs: () => saveOnAirPrefs() }))
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
  act(() => root!.render(<CompactSetup practices={practices} initialMode={initialMode} initialPracticeId={initialPracticeId} onStart={start} onClose={vi.fn()} />))
}
afterEach(() => { act(() => root?.unmount()); host?.remove(); start.mockClear(); saveOnAirPrefs.mockClear(); window.localStorage.clear() })
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
    expect(start).toHaveBeenCalledWith({ practiceId: 'sit', mode: 'still', stillMode: 'timer', patternSlug: 'box' })
  })
  it('custom still duration is validated and forwarded without resuming/logging', () => {
    render('still', 'free')
    const input = host.querySelector('input')!
    const update = (value: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
    const begin = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Start timer')!
    update('0'); expect(begin.disabled).toBe(true)
    update('13'); expect(begin.disabled).toBe(false)
    act(() => begin.click())
    expect(start).toHaveBeenCalledWith({ practiceId: 'free', mode: 'still', minutesOverride: 13, stillMode: 'timer', patternSlug: 'box' })
  })
  it('custom Get Moving length lands in the composed plan and is remembered for the Free Practice (LIVE-2234)', () => {
    render('move', 'free-move')
    const input = host.querySelector('input')!
    const update = (value: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
    const begin = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Start timer')!
    update('0'); expect(begin.disabled).toBe(true)
    update('13'); expect(begin.disabled).toBe(false)
    act(() => begin.click())
    expect(start).toHaveBeenCalledWith({ practiceId: 'free-move', mode: 'move', moveConfig: expect.objectContaining({ mode: 'walk', walkMinutes: 13 }) })
    expect(JSON.parse(window.localStorage.getItem('fq_timer_settings')!)).toMatchObject({ move: { mode: 'walk', walkMinutes: 13 } })
  })
  it('offers every Get Moving mode on the door with its Plan and Cues sub-menus, no second screen (LIVE-2234)', () => {
    render('move', 'free-move')
    const chips = () => [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Sub-mode"] button')]
    expect(chips().map((b) => b.textContent)).toEqual(['Walk', 'Run', 'Yoga', 'Strength', 'Stretch', 'Play'])
    act(() => chips().find((b) => b.textContent === 'Strength')!.click())
    expect(host.textContent).toContain('Authored sequence')
    const planRow = [...host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find((b) => b.textContent?.includes('Plan'))!
    act(() => planRow.click())
    expect(planRow.getAttribute('aria-expanded')).toBe('true')
    act(() => chips().find((b) => b.textContent === 'Walk')!.click())
    const cuesRow = [...host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find((b) => b.textContent?.includes('Cues'))!
    act(() => cuesRow.click())
    const every5 = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Every 5 min')
    if (every5) act(() => every5.click())
    const begin = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Start timer')!
    act(() => begin.click())
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ mode: 'move', moveConfig: expect.objectContaining({ mode: 'walk', ...(every5 ? { walkIntervalMin: 5 } : {}) }) }))
    expect(host.textContent).not.toContain('More settings')
  })
  it('keeps locked authored lengths and log-only semantics out of custom overrides', () => {
    practices[0].durationLocked = true
    render()
    expect(host.querySelector('input')!.disabled).toBe(true)
    const begin = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Start timer')!
    act(() => begin.click())
    expect(start).toHaveBeenCalledWith({ practiceId: 'sit', mode: 'still', stillMode: 'timer', patternSlug: 'box' })
    practices[0].durationLocked = false
  })
  it('offers every Be Still sub-mode on the door and forwards the pick with its settings (LIVE-2241)', () => {
    render('still', 'free')
    const chips = [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Sub-mode"] button')].map((b) => b.textContent)
    expect(chips).toEqual(['Meditate', 'Breathe', 'Journal', 'Stillness', 'Ritual', 'Just Log'])
    const breathe = [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Sub-mode"] button')].find((b) => b.textContent === 'Breathe')!
    act(() => breathe.click())
    expect(breathe.getAttribute('aria-pressed')).toBe('true')
    // The Breath sub-menu is a row on this screen, not a second screen.
    const breathRow = [...host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find((b) => b.textContent?.includes('Breath'))!
    act(() => breathRow.click())
    const coherence = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Coherence')!
    act(() => coherence.click())
    const begin = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Start timer')!
    act(() => begin.click())
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ practiceId: 'free', mode: 'still', stillMode: 'breath', patternSlug: 'cohere' }))
    expect(JSON.parse(window.localStorage.getItem('fq_timer_settings')!)).toMatchObject({ pattern: 'cohere' })
    expect(host.textContent).not.toContain('More settings')
  })
  it('Just Log opens the practice note instead of a timer', () => {
    render('still', 'free')
    const log = [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Sub-mode"] button')].find((b) => b.textContent === 'Just Log')!
    act(() => log.click())
    expect(host.querySelector('input')).toBeNull()
    const go = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Open practice')!
    act(() => go.click())
    expect(start).toHaveBeenCalledWith({ practiceId: 'free', mode: 'still', stillMode: 'log', patternSlug: 'box' })
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
