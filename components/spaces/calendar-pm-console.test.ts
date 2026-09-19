import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// LIVE-415 source shape: Admin mounts CalendarPmConsole. C2–C4 own the named lanes, so this
// file must not close those rows by existing.

describe('CalendarPmConsole source (LIVE-415)', () => {
  const consoleSrc = readFileSync('components/spaces/calendar-pm-console.tsx', 'utf8')
  const page = readFileSync('app/(main)/spaces/[slug]/(profile)/calendar/page.tsx', 'utf8')

  it('exports CalendarPmConsole and the Calendar tab mounts it', () => {
    expect(consoleSrc).toContain('export function CalendarPmConsole')
    expect(page).toContain('CalendarPmConsole')
  })

  it('does not declare C2–C4 lane identifiers', () => {
    expect(consoleSrc).not.toContain('pencilLane')
    expect(consoleSrc).not.toContain('planningLane')
    expect(consoleSrc).not.toContain('productionLane')
  })
})
