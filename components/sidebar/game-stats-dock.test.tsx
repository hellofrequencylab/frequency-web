// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { GameStatsPanel, type DockData } from './game-stats-dock'
import { streakDayRun, frozenDaysFrom } from '@/lib/practice-streak'
import type { StreakDay } from '@/components/ui/streak-meter'

// THE PROBE LIVE-101 ASKED FOR: the dock CAN emit a frozen day.
//
// StreakMeter has painted three day states since it shipped, and the third — `frozen`, the
// info-teal snowflake that says a pause is not a failure — had zero live producers. The dock
// was the component's ONLY render site, and it was handed a boolean[] built from practice_logs
// alone. A freeze writes no log row, so a bridged day arrived as `false` and painted as MISSED:
// the rail told a member who had deliberately rested that they had slipped.
//
// The row's own note said the honest probe is a render test asserting the dock CAN emit a frozen
// day, and that it could not be written until the plumbing existed. It exists now, and it is
// wired end to end on purpose: the fixtures below run the REAL assembly helpers
// (frozenDaysFrom + streakDayRun) over a REAL `profiles.meta` shape, so this goes red if the
// plumbing is reverted at any rung — the meta read, the helper, the DockData type, or the render.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

const TODAY = '2026-06-06'

const day = (n: number) => {
  const d = new Date(Date.UTC(2026, 5, 6 - n))
  return d.toISOString().slice(0, 10)
}

const DOCK: Omit<DockData, 'last7'> = {
  zaps: 120,
  gems: 40,
  streak: 7,
  rank: 'initiate',
  todaysMove: { kind: 'done' },
  rankProgress: { nextLabel: 'Adept', toGo: 1, pct: 50 },
  arc: null,
  vaultGems: 40,
}

function mount(last7: StreakDay[]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<GameStatsPanel data={{ ...DOCK, last7 }} />))
  return container!
}

const dots = (c: HTMLElement, state: StreakDay) => c.querySelectorAll(`[data-day="${state}"]`)

describe('the dock renders the day run it is handed', () => {
  it('emits a FROZEN day when the member has a reserve-bridged day', () => {
    const meta = { practiceStreak: { frozenDates: [day(3)] } }
    const logged = new Set([day(6), day(5), day(4), day(2), day(1), day(0)])
    const c = mount(streakDayRun(TODAY, logged, frozenDaysFrom(meta, TODAY)))
    expect(dots(c, 'frozen').length).toBe(1)
    expect(dots(c, 'done').length).toBe(6)
    expect(dots(c, 'missed').length).toBe(0)
    // It reads as the kindness it is: info tone plus the snowflake, never a danger token.
    const frozen = dots(c, 'frozen')[0]
    expect(frozen.className).toContain('bg-info-bg')
    expect(frozen.querySelector('svg')).not.toBeNull()
    expect(frozen.className).not.toContain('danger')
  })

  it('emits FROZEN for a whole rest window, and names the bridge to assistive tech', () => {
    const meta = { practiceStreak: { rest: { from: day(3), through: day(1) } } }
    const logged = new Set([day(6), day(5), day(4), day(0)])
    const c = mount(streakDayRun(TODAY, logged, frozenDaysFrom(meta, TODAY)))
    expect(dots(c, 'frozen').length).toBe(3)
    expect(c.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe(
      '4 of the last 7 days done, 3 bridged by a streak freeze',
    )
  })

  // EQUIVALENCE. A member with no freeze data must see exactly what they saw before the
  // tri-state landed: the same dots, the same classes, the same sentence, and never a snowflake.
  it('renders done/missed exactly as before for a member with no freeze data', () => {
    const logged = new Set([day(6), day(4), day(0)])
    const c = mount(streakDayRun(TODAY, logged, frozenDaysFrom(null, TODAY)))
    expect(dots(c, 'done').length).toBe(3)
    expect(dots(c, 'missed').length).toBe(4)
    expect(dots(c, 'frozen').length).toBe(0)
    expect(dots(c, 'done')[0].className).toContain('bg-primary')
    expect(dots(c, 'missed')[0].className).toContain('bg-transparent')
    expect(c.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe(
      '3 of the last 7 days done',
    )
    for (const el of Array.from(c.querySelectorAll('[data-day]'))) {
      expect(el.className).not.toContain('danger')
    }
  })

  it('still shows the streak count beside the run', () => {
    const c = mount(streakDayRun(TODAY, new Set([day(0)]), new Set()))
    expect(c.textContent).toContain('7')
    expect(c.textContent).toContain('day streak')
  })
})
