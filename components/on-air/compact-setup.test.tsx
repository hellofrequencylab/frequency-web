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
const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('button')]
const go = () => buttons().find((b) => b.textContent?.startsWith('Start timer') || b.textContent?.startsWith('Continue,') || b.textContent?.startsWith('Log it'))!
const minutesField = () => host.querySelector<HTMLInputElement>('[aria-label^="Minutes"]')
const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
const openHow = () => act(() => buttons().find((b) => b.getAttribute('aria-expanded') !== null && b.textContent?.startsWith('How'))!.click())
const styles = () => [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Style"] button')]
const row = (name: string) => buttons().find((b) => b.getAttribute('aria-expanded') !== null && b.textContent?.startsWith(name))!
afterEach(() => { act(() => root?.unmount()); host?.remove(); start.mockClear(); saveOnAirPrefs.mockClear(); window.localStorage.clear(); vi.unstubAllGlobals() })
describe('the Mindless door (LIVE-2245)', () => {
  it('offers one free practice for the current mode, retaining the real adopted entry', () => {
    expect(setupPractices([...practices, { ...practices[1], id: 'duplicate' }], 'still').map((p) => p.id)).toEqual(['sit', 'free'])
  })
  it('opens on the adopted practice with its authored length in the orb and starts it from Go', () => {
    render()
    expect(minutesField()!.value).toBe('17')
    expect(host.textContent).toContain('Logs as Reflect · already counted today, this one is extra')
    act(() => go().click())
    expect(start).toHaveBeenCalledWith({ practiceId: 'sit', mode: 'still', minutesOverride: 17, stillMode: 'timer', patternSlug: 'box' })
  })
  it('custom still duration is validated and forwarded without resuming/logging', () => {
    render('still', 'free')
    type(minutesField()!, '0'); expect(go().disabled).toBe(true); expect(host.textContent).toContain('Choose 1 to 120 minutes.')
    type(minutesField()!, '13'); expect(go().disabled).toBe(false)
    act(() => go().click())
    expect(start).toHaveBeenCalledWith({ practiceId: 'free', mode: 'still', minutesOverride: 13, stillMode: 'timer', patternSlug: 'box' })
  })
  it('the minus and plus beside the orb step the length by one, and a preset sets it', () => {
    render('still', 'free')
    act(() => buttons().find((b) => b.textContent === 'One minute more')!.click())
    expect(minutesField()!.value).toBe('11')
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Length presets in minutes"] [aria-label="20 minutes"]')!.click())
    expect(minutesField()!.value).toBe('20')
    expect(JSON.parse(window.localStorage.getItem('fq_timer_settings')!)).toMatchObject({ minutes: 20 })
  })
  it('custom Get Moving length lands in the composed plan and is remembered for the Free Practice (LIVE-2242)', () => {
    render('move', 'free-move')
    type(minutesField()!, '0'); expect(go().disabled).toBe(true)
    type(minutesField()!, '13'); expect(go().disabled).toBe(false)
    act(() => go().click())
    expect(start).toHaveBeenCalledWith({ practiceId: 'free-move', mode: 'move', moveConfig: expect.objectContaining({ mode: 'walk', walkMinutes: 13 }) })
    expect(JSON.parse(window.localStorage.getItem('fq_timer_settings')!)).toMatchObject({ move: { mode: 'walk', walkMinutes: 13 } })
  })
  it('offers every Get Moving style in the How picker with its Plan and Cues rows, no second screen (LIVE-2242)', () => {
    render('move', 'free-move')
    openHow()
    expect(styles().map((b) => b.textContent)).toEqual(['Walk', 'Run', 'Yoga', 'Strength', 'Stretch', 'Play'])
    act(() => styles().find((b) => b.textContent === 'Strength')!.click())
    expect(host.textContent).toContain('Tabata, 8 rounds, 4:00')
    expect(minutesField()).toBeNull()
    act(() => row('Plan').click())
    expect(row('Plan').getAttribute('aria-expanded')).toBe('true')
    act(() => buttons().find((b) => b.getAttribute('aria-label') === 'Rounds up')!.click())
    expect(host.textContent).toContain('Tabata, 9 rounds')
    openHow()
    act(() => styles().find((b) => b.textContent === 'Walk')!.click())
    act(() => row('Cues').click())
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Reminder"] button:nth-child(2)')!.click())
    expect(row('Cues').textContent).toContain('Reminder every 5 min')
    act(() => go().click())
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ mode: 'move', moveConfig: expect.objectContaining({ mode: 'walk', walkIntervalMin: 5 }) }))
    expect(host.textContent).not.toContain('More settings')
  })
  it('keeps locked authored lengths and log-only semantics out of custom overrides', () => {
    practices[0].durationLocked = true
    render()
    expect(minutesField()).toBeNull()
    expect(host.textContent).toContain('Fixed length, set by Reflect')
    act(() => go().click())
    expect(start).toHaveBeenCalledWith({ practiceId: 'sit', mode: 'still', stillMode: 'timer', patternSlug: 'box' })
    practices[0].durationLocked = false
  })
  it('offers every Be Still style and the Breath row, and forwards the pick with its settings (LIVE-2241)', () => {
    render('still', 'free')
    openHow()
    expect(styles().map((b) => b.textContent)).toEqual(['Meditate', 'Breathe', 'Journal', 'Stillness', 'Ritual', 'Just Log'])
    act(() => styles().find((b) => b.textContent === 'Breathe')!.click())
    expect(minutesField()!.value).toBe('5')
    act(() => row('Breath').click())
    act(() => buttons().find((b) => b.textContent === 'Coherence')!.click())
    expect(row('Breath').textContent).toContain('Coherence 5-5')
    act(() => go().click())
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ practiceId: 'free', mode: 'still', stillMode: 'breath', patternSlug: 'cohere' }))
    expect(JSON.parse(window.localStorage.getItem('fq_timer_settings')!)).toMatchObject({ pattern: 'cohere' })
    expect(host.textContent).not.toContain('More settings')
  })
  it('Just Log takes the note on the door and logs it from the one button', () => {
    render('still', 'free')
    openHow()
    act(() => styles().find((b) => b.textContent === 'Just Log')!.click())
    expect(minutesField()).toBeNull()
    type(host.querySelector<HTMLTextAreaElement>('[aria-label="Session note"]')!, 'Felt good')
    expect(go().textContent).toBe('Log it')
    act(() => go().click())
    expect(start).toHaveBeenCalledWith({ practiceId: 'free', mode: 'still', stillMode: 'log', patternSlug: 'box', note: 'Felt good' })
  })
  it('offers Continue or Start fresh when the practice has a partial today, continuing by default (LIVE-2243)', () => {
    practices[0].partialToday = { bankedSec: 300, targetSec: 1020 }
    render()
    expect(go().textContent).toBe('Continue, 12 min left')
    expect(minutesField()).toBeNull()
    expect(host.textContent).toContain('5 of 17 min banked today')
    act(() => go().click())
    expect(start).toHaveBeenLastCalledWith({ practiceId: 'sit', mode: 'still', stillMode: 'timer', patternSlug: 'box' })
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Continue or start fresh"] button')!.click())
    type(minutesField()!, '9')
    expect(go().textContent).toBe('Start timer')
    act(() => go().click())
    expect(start).toHaveBeenLastCalledWith({ practiceId: 'sit', mode: 'still', minutesOverride: 9, stillMode: 'timer', patternSlug: 'box', fresh: true })
    practices[0].partialToday = null
  })
  it('switches modes with one free entry and the correct selected authored movement length', () => {
    render()
    const moving = buttons().find((b) => b.getAttribute('role') === 'tab' && b.textContent?.includes('Get Moving'))!
    act(() => moving.click())
    expect(moving.getAttribute('aria-selected')).toBe('true')
    act(() => buttons().find((b) => b.getAttribute('aria-expanded') !== null && b.textContent?.startsWith('Practice'))!.click())
    const rows = [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Your practices"] button')]
    expect(rows.map((b) => b.textContent)).toEqual(['WalkWalk, 22 min', 'Free PracticeAny style, any length'])
    act(() => rows[0].click())
    expect(minutesField()!.value).toBe('22')
  })
  it('from 840px the door is a dialog with the Today rail, Sound and feel selects and Enter to start', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    render()
    const dialog = host.querySelector('[role="dialog"]')!
    expect(dialog.getAttribute('aria-label')).toBe('Mindless timer setup')
    expect([...host.querySelectorAll('[aria-label="Your practices"] button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Reflect', 'Free Practice'])
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="Bell"]')!.value).toBe('off')
    expect(host.textContent).toContain('5 s countdown, then 17 min of Meditate. Logs as Reflect.')
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ practiceId: 'sit', minutesOverride: 17 }))
  })
})
