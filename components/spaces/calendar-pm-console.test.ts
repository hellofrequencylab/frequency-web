import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('CalendarPmConsole source (LIVE-415 / LIVE-416 / LIVE-417 / LIVE-418)', () => {
  const consoleSrc = readFileSync('components/spaces/calendar-pm-console.tsx', 'utf8')
  const page = readFileSync('app/(main)/spaces/[slug]/(profile)/calendar/page.tsx', 'utf8')
  const shell = readFileSync('components/spaces/calendar-workspace.tsx', 'utf8')

  it('exports CalendarPmConsole and the Calendar tab mounts it', () => {
    expect(consoleSrc).toContain('export function CalendarPmConsole')
    expect(page).toContain('CalendarWorkspace')
    expect(shell).toContain('CalendarPmConsole')
  })

  it('declares the C2–C4 named lanes', () => {
    expect(consoleSrc).toContain('pencilLane')
    expect(consoleSrc).toContain('planningLane')
    expect(consoleSrc).toContain('productionLane')
  })

  it('Guest empty uses the kit EmptyState over guestFeedState', () => {
    expect(page).toContain('guestLiveItems')
    expect(page).toContain('guestFeedState')
    expect(page).toContain('loadPublicSpaceWindow')
    expect(shell).toContain('EmptyState')
    expect(page).not.toContain('No upcoming events yet')
    expect(shell).not.toContain('No upcoming events yet')
  })
})
