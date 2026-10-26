import { expect, it, vi } from 'vitest'
import { eventInstant } from './zone'

// The SQL guest-RSVP gate already uses PostgreSQL AT TIME ZONE. Rendered expiry,
// reminders and published metadata must resolve the same stored wall clock.
it.each([
  ['2026-03-08T02:30:00Z', 'America/Los_Angeles', '2026-03-08T10:30:00.000Z'],
  ['2026-11-01T01:30:00Z', 'America/Los_Angeles', '2026-11-01T09:30:00.000Z'],
  ['2026-03-08T02:30:00Z', 'America/New_York', '2026-03-08T07:30:00.000Z'],
  ['2026-11-01T01:30:00Z', 'America/New_York', '2026-11-01T06:30:00.000Z'],
  ['2011-12-30T00:00:00Z', 'Pacific/Apia', '2011-12-30T10:00:00.000Z'],
] as const)('agrees with PostgreSQL for %s in %s', (wall, zone, expected) => {
  expect(eventInstant(wall, zone)?.toISOString()).toBe(expected)
})

it('reuses timezone formatters instead of constructing one per conversion', async () => {
  vi.resetModules()
  const zoneModule = await import('./zone')
  const spy = vi.spyOn(Intl, 'DateTimeFormat')
  try {
    for (let i = 0; i < 20; i++) zoneModule.eventInstant('2026-06-26T19:00:00Z', 'America/Los_Angeles')
    expect(spy).toHaveBeenCalledTimes(1)
  } finally { spy.mockRestore() }
})

it('bounds cached timezone formatters to 64 entries', async () => {
  vi.resetModules()
  const zoneModule = await import('./zone')
  const zones = Intl.supportedValuesOf('timeZone').slice(0, 65)
  const spy = vi.spyOn(Intl, 'DateTimeFormat')
  try {
    for (const zone of zones) zoneModule.eventInstant('2026-06-26T19:00:00Z', zone)
    zoneModule.eventInstant('2026-06-26T19:00:00Z', zones[0])
    expect(spy).toHaveBeenCalledTimes(66)
  } finally { spy.mockRestore() }
})
