// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PracticeTimerSetup, type PracticeTimerSetupProps } from './practice-timer-setup'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const io = { queueSave: vi.fn(), commitDuration: vi.fn(), onDurationInput: vi.fn(), suggest: vi.fn() }
const base: PracticeTimerSetupProps = {
  timerKind: 'mindless', movementConfig: null, mindlessMode: null, breathPattern: null, durationLocked: false,
  warmupMessage: null, warmupSec: null, durationMin: '',
  onDurationInput: io.onDurationInput, commitDuration: io.commitDuration, queueSave: io.queueSave,
  signals: { title: 'Box breathing before a hard call' },
}
let root: Root
let element: HTMLDivElement
beforeEach(() => { vi.clearAllMocks(); element = document.createElement('div'); document.body.appendChild(element); root = createRoot(element) })
afterEach(() => { act(() => root.unmount()); element.remove() })
const buttons = () => [...element.querySelectorAll('button')]
const suggested = () => [...element.querySelectorAll('[aria-label="Suggested timer setups"] button')] as HTMLButtonElement[]
const radio = (group: string, name: string) =>
  [...element.querySelectorAll(`[role="radiogroup"][aria-label="${group}"] [role="radio"]`)].find((b) => b.textContent?.startsWith(name)) as HTMLButtonElement

describe('the Timer section of the Practice editor', () => {
  it('names the two timer modes by their own names and saves nothing on open', () => {
    act(() => root.render(<PracticeTimerSetup {...base} />))
    expect(radio("How it's done", 'Be Still').getAttribute('aria-checked')).toBe('true')
    expect(radio("How it's done", 'Get Moving')).toBeTruthy()
    expect(radio("How it's done", 'Log it')).toBeTruthy()
    expect(radio("How it's done", 'Mindless')).toBeUndefined()
    expect(io.queueSave).not.toHaveBeenCalled()
    expect(io.commitDuration).not.toHaveBeenCalled()
  })

  it("offers setups matched to the author's words, and one tap saves the whole setup in one patch", () => {
    act(() => root.render(<PracticeTimerSetup {...base} />))
    expect(suggested()[0].textContent).toContain('Box breathing')
    act(() => suggested()[0].click())
    expect(io.commitDuration).toHaveBeenCalledTimes(1)
    expect(io.commitDuration).toHaveBeenCalledWith(5, { timer_kind: 'mindless', movement_config: null, mindless_mode: 'breathe', breath_pattern: 'box' })
    expect(suggested()[0].getAttribute('aria-pressed')).toBe('true')
    // The controls below now show what was applied.
    expect(radio('Be Still mode', 'Breathe').getAttribute('aria-checked')).toBe('true')
    expect(radio('Breath pattern', 'Box').getAttribute('aria-checked')).toBe('true')
    // A hand edit means the timer is no longer that setup.
    act(() => radio('Be Still mode', 'Meditate').click())
    expect(suggested()[0].getAttribute('aria-pressed')).toBe('false')
  })

  it('gives a Get Moving practice one length, and the session length follows it', () => {
    act(() => root.render(<PracticeTimerSetup {...base} timerKind="movement" movementConfig={{ mode: 'walk', walkMinutes: 20 }} durationMin="20" signals={{ title: 'Evening walk' }} />))
    expect(element.querySelector('[aria-label="Time (minutes)"]')).toBeNull()
    act(() => buttons().find((b) => b.textContent === '30 min')!.click())
    expect(io.commitDuration).toHaveBeenLastCalledWith(30, { timer_kind: 'movement', movement_config: { mode: 'walk', walkMinutes: 30, walkIntervalMin: 0 } })
    expect(element.textContent).toContain('Get Moving · 30 min walk')
  })

  it('shows what members will see, and asks Vera only when the author taps', async () => {
    io.suggest.mockResolvedValue({ data: { vera: true, picks: [{ setupId: 'log-it', reasonId: 'act' }] } })
    act(() => root.render(<PracticeTimerSetup {...base} mindlessMode="meditate" durationMin="10" durationLocked suggestTimer={io.suggest} />))
    expect(element.textContent).toContain('Be Still · Meditate · 10 min')
    expect(element.textContent).toContain('The length is fixed.')
    expect(io.suggest).not.toHaveBeenCalled()
    await act(async () => buttons().find((b) => b.textContent === 'Ask Vera')!.click())
    expect(io.suggest).toHaveBeenCalledWith(expect.objectContaining({ title: 'Box breathing before a hard call', durationMin: 10 }))
    expect(suggested().map((b) => b.textContent)).toEqual([expect.stringContaining('Log it')])
    expect(element.querySelector('[role="status"]')?.textContent).toBe('Vera picked these from what you wrote.')
    expect(io.queueSave).not.toHaveBeenCalled()
  })
})
