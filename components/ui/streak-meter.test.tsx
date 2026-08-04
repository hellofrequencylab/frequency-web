// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { StreakMeter, type StreakDay } from './streak-meter'

// Locks the StreakMeter emotional contract (DAWN 2026-08-03 §5; BRIEF-06 §2.12):
// a missed day is a HOLLOW dot and NEVER a danger color (an absence, not a
// failure), and a frozen day reads as kindness (info teal + snowflake), never
// as a penalty.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(days: StreakDay[], extra?: { count?: number; label?: string }) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<StreakMeter days={days} {...extra} />))
  return container!
}

describe('StreakMeter', () => {
  it('renders one dot per day with its state', () => {
    const c = mount(['done', 'missed', 'frozen', 'done'])
    expect(c.querySelectorAll('[data-day]').length).toBe(4)
    expect(c.querySelectorAll('[data-day="done"]').length).toBe(2)
    expect(c.querySelectorAll('[data-day="missed"]').length).toBe(1)
    expect(c.querySelectorAll('[data-day="frozen"]').length).toBe(1)
  })

  it('a done day is a filled dot; a missed day is hollow', () => {
    const c = mount(['done', 'missed'])
    const done = c.querySelector('[data-day="done"]')!
    const missed = c.querySelector('[data-day="missed"]')!
    expect(done.className).toContain('bg-primary')
    expect(missed.className).toContain('border')
    expect(missed.className).toContain('bg-transparent')
  })

  it('a missed day is NEVER red or a danger token', () => {
    const c = mount(['missed', 'missed', 'done'])
    for (const el of Array.from(c.querySelectorAll('*'))) {
      expect(el.className).not.toContain('danger')
      expect(el.className).not.toContain('red')
    }
  })

  it('a frozen day reads as kindness: info tone + snowflake, no failure styling', () => {
    const c = mount(['frozen'])
    const frozen = c.querySelector('[data-day="frozen"]')!
    expect(frozen.className).toContain('bg-info-bg')
    expect(frozen.querySelector('svg')).not.toBeNull()
    expect(frozen.className).not.toContain('danger')
  })

  it('exposes the run as one accessible image and names the freeze bridge', () => {
    const c = mount(['done', 'frozen', 'done'])
    const img = c.querySelector('[role="img"]')!
    expect(img.getAttribute('aria-label')).toBe('2 of the last 3 days done, 1 bridged by a streak freeze')
    // The dots themselves are decorative.
    for (const dot of Array.from(c.querySelectorAll('[data-day]'))) {
      expect(dot.getAttribute('aria-hidden')).toBe('true')
    }
  })

  // The Reading class owes an EMPTY state (docs/INTERACTION-STATES.md §2): zero is a real
  // answer, and it must render something a person can read, not a collapsed box.
  it('reads as a beginning when there are no days yet, not "0 of the last 0"', () => {
    const c = mount([])
    expect(c.textContent).toContain('No days logged yet')
    expect(c.textContent).not.toContain('of the last 0')
    expect(c.querySelectorAll('[data-day]').length).toBe(0)
  })

  it('never blames the member for an empty streak', () => {
    const c = mount([])
    for (const el of Array.from(c.querySelectorAll('*'))) {
      expect(el.className).not.toContain('danger')
    }
  })

  it('renders the optional mono count + label', () => {
    const c = mount(['done', 'done'], { count: 12, label: 'day streak' })
    const value = c.querySelector('.font-mono')
    expect(value).not.toBeNull()
    expect(value!.textContent).toBe('12')
    expect(c.textContent).toContain('day streak')
  })
})
