import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { memberDay } from './member-day'

// The practice day flips at the member's LOCAL midnight (functional QA, 2026-10-28). Fixed instants only,
// so these never depend on the machine clock or its zone.

describe('memberDay', () => {
  it('is still the previous day for a Pacific member at 05:30 UTC (PDT, 22:30 local)', () => {
    expect(memberDay('America/Los_Angeles', new Date('2026-10-28T05:30:00Z'))).toBe('2026-10-27')
    expect(memberDay('UTC', new Date('2026-10-28T05:30:00Z'))).toBe('2026-10-28')
  })

  it('flips exactly at local midnight, either side of the instant', () => {
    expect(memberDay('America/Los_Angeles', new Date('2026-10-28T06:59:59Z'))).toBe('2026-10-27')
    expect(memberDay('America/Los_Angeles', new Date('2026-10-28T07:00:00Z'))).toBe('2026-10-28')
  })

  it('follows the offset change when daylight time ends (2026-11-01 in the US)', () => {
    // PDT (-7) until 09:00Z, PST (-8) after: local midnight on the 2nd is 08:00Z.
    expect(memberDay('America/Los_Angeles', new Date('2026-11-02T07:59:59Z'))).toBe('2026-11-01')
    expect(memberDay('America/Los_Angeles', new Date('2026-11-02T08:00:00Z'))).toBe('2026-11-02')
  })

  it('handles a zone ahead of UTC and a half-hour offset', () => {
    expect(memberDay('Pacific/Auckland', new Date('2026-10-28T11:30:00Z'))).toBe('2026-10-29')
    expect(memberDay('Asia/Kolkata', new Date('2026-10-28T18:29:59Z'))).toBe('2026-10-28')
    expect(memberDay('Asia/Kolkata', new Date('2026-10-28T18:30:00Z'))).toBe('2026-10-29')
  })

  it('falls back to UTC for a null, blank or unknown zone', () => {
    const now = new Date('2026-10-28T05:30:00Z')
    expect(memberDay(null, now)).toBe('2026-10-28')
    expect(memberDay('', now)).toBe('2026-10-28')
    expect(memberDay('Not/AZone', now)).toBe('2026-10-28')
  })
})
