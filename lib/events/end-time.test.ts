import { describe, expect, it } from 'vitest'
import { eventHasEnded } from './end-time'

describe('stored event expiry', () => {
  it.each([
    ['2026-06-26T19:00:00Z', 'America/Los_Angeles', '2026-06-27T02:00:00Z'],
    ['2026-12-26T19:00:00Z', 'America/Los_Angeles', '2026-12-27T03:00:00Z'],
    ['2026-06-26T19:00:00Z', 'Europe/London', '2026-06-26T18:00:00Z'],
    ['2026-12-26T19:00:00Z', 'Europe/London', '2026-12-26T19:00:00Z'],
    ['2026-06-26T19:00:00Z', null, '2026-06-27T02:00:00Z'],
  ])('uses the actual cutoff for %s in %s', (ends_at, time_zone, instant) => {
    const event = { starts_at: '2026-06-26T18:00:00Z', ends_at, time_zone }
    const now = Date.parse(instant)
    expect(eventHasEnded(event, now - 1)).toBe(false)
    expect(eventHasEnded(event, now)).toBe(false)
    expect(eventHasEnded(event, now + 1)).toBe(true)
  })

  it('falls back to the start when no end was supplied', () => {
    expect(eventHasEnded({ starts_at: '2026-06-26T19:00:00Z', time_zone: 'Europe/London' }, Date.parse('2026-06-26T18:30:00Z'))).toBe(true)
  })

  it('does not invent an expiry for missing or malformed times', () => {
    expect(eventHasEnded({ starts_at: null })).toBe(false)
    expect(eventHasEnded({ starts_at: 'invalid' })).toBe(false)
  })
})
