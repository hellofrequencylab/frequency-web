import { describe, expect, it } from 'vitest'
import { hasZoneSuffix, localInputToIso, parseZonedInstant } from './instant'

// A ZONED INSTANT VERSUS A BARE WALL TIME (SCAN-702). A datetime-local value has no zone; read on a
// UTC server it is hours off from what the owner picked. The client makes the instant, the server
// refuses anything that still has no zone.

describe('hasZoneSuffix', () => {
  it('is false for a raw datetime-local value and true for Z or an offset', () => {
    expect(hasZoneSuffix('2026-06-21T14:30')).toBe(false)
    expect(hasZoneSuffix('2026-06-21T14:30:00')).toBe(false)
    expect(hasZoneSuffix('2026-06-21T14:30:00.000Z')).toBe(true)
    expect(hasZoneSuffix('2026-06-21T14:30:00-07:00')).toBe(true)
    expect(hasZoneSuffix('2026-06-21T14:30:00+0530')).toBe(true)
  })
})

describe('parseZonedInstant', () => {
  it('refuses a zone-less string (the server half of the rule)', () => {
    expect(parseZonedInstant('2026-06-21T14:30')).toBeNull()
  })

  it('normalises an offset string to a UTC ISO instant', () => {
    expect(parseZonedInstant('2026-06-21T14:30:00-07:00')).toBe('2026-06-21T21:30:00.000Z')
    expect(parseZonedInstant(' 2026-06-21T14:30:00Z ')).toBe('2026-06-21T14:30:00.000Z')
  })

  it('fails closed on non-strings, blanks and garbage', () => {
    expect(parseZonedInstant(undefined)).toBeNull()
    expect(parseZonedInstant(null)).toBeNull()
    expect(parseZonedInstant('')).toBeNull()
    expect(parseZonedInstant('not-a-dateZ')).toBeNull()
    expect(parseZonedInstant(12345)).toBeNull()
  })
})

describe('localInputToIso', () => {
  it('turns a wall time into the instant that wall time IS in this machine zone', () => {
    const local = '2026-06-21T14:30'
    const iso = localInputToIso(local)
    expect(iso).toMatch(/Z$/)
    // Round trip: the instant reads back as the same wall time in the zone it was written in.
    const d = new Date(iso)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5)
    expect(d.getDate()).toBe(21)
    expect(d.getHours()).toBe(14)
    expect(d.getMinutes()).toBe(30)
    expect(parseZonedInstant(iso)).toBe(iso)
  })

  it('is empty for a blank or unparseable value', () => {
    expect(localInputToIso('')).toBe('')
    expect(localInputToIso('nope')).toBe('')
  })
})
