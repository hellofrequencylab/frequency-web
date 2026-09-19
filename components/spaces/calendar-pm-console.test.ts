import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// LIVE-415 / LIVE-418 source shape: Admin mounts CalendarPmConsole. C4 owns productionLane.
// C2 and C3 own the remaining named lanes, so this file must not close those rows by existing.

describe('CalendarPmConsole source (LIVE-415 / LIVE-418)', () => {
  const consoleSrc = readFileSync('components/spaces/calendar-pm-console.tsx', 'utf8')
  const page = readFileSync('app/(main)/spaces/[slug]/(profile)/calendar/page.tsx', 'utf8')

  it('exports CalendarPmConsole and the Calendar tab mounts it', () => {
    expect(consoleSrc).toContain('export function CalendarPmConsole')
    expect(page).toContain('CalendarPmConsole')
  })

  it('declares the C4 production lane and leaves C2 and C3 undeclared', () => {
    expect(consoleSrc).toContain('productionLane')
    expect(consoleSrc).not.toContain('pencilLane')
    expect(consoleSrc).not.toContain('planningLane')
  })
})
