import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// LIVE-415 / LIVE-416 / LIVE-418 source shape: Admin mounts CalendarPmConsole.
// C2 owns pencilLane. C4 owns productionLane. C3 owns planningLane, so this
// file must not close that row by existing.

describe('CalendarPmConsole source (LIVE-415 / LIVE-416 / LIVE-418)', () => {
  const consoleSrc = readFileSync('components/spaces/calendar-pm-console.tsx', 'utf8')
  const page = readFileSync('app/(main)/spaces/[slug]/(profile)/calendar/page.tsx', 'utf8')

  it('exports CalendarPmConsole and the Calendar tab mounts it', () => {
    expect(consoleSrc).toContain('export function CalendarPmConsole')
    expect(page).toContain('CalendarPmConsole')
  })

  it('declares the C2 and C4 lanes and leaves C3 undeclared', () => {
    expect(consoleSrc).toContain('pencilLane')
    expect(consoleSrc).toContain('productionLane')
    expect(consoleSrc).not.toContain('planningLane')
  })
})
