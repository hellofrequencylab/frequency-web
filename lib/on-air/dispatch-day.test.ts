import { describe, it, expect } from 'vitest'
import { dispatchDay } from './dispatch-day'

// SCAN-106. The Dispatch day key is the value `vera_dispatches` de-duplicates on
// (`UNIQUE (profile_id, day)`), so getting it wrong does not shift a label — it mints the row
// under the wrong day. The old key was `new Date().toISOString().slice(0, 10)`, the SERVER's UTC
// calendar day, which on Vercel rolls over at ~5pm Pacific: a Dispatch generated at 6pm Pacific
// was stored under TOMORROW and stopped reading as today's the instant it was written.
//
// These lock the CONSEQUENCE — the key names the community's calendar date at instants where UTC
// and Pacific disagree — and they are written as absolute instants so they are independent of the
// machine's own zone (they fail on a UTC runner if the fix regresses, which is the point).
describe('dispatchDay — the community day key', () => {
  it('names TODAY in the community zone during the evening window UTC has already left', () => {
    // 6:00pm PDT on 2026-08-25 is already 2026-08-26 in UTC.
    expect(dispatchDay(new Date('2026-08-26T01:00:00Z'))).toBe('2026-08-25')
    // The same at 11:59pm PDT — the last minute of the community's day.
    expect(dispatchDay(new Date('2026-08-26T06:59:00Z'))).toBe('2026-08-25')
  })

  it('rolls over at the community midnight, not at UTC midnight', () => {
    // 11:59pm PDT Aug 25 and 12:00am PDT Aug 26 are one minute apart and must differ.
    expect(dispatchDay(new Date('2026-08-26T06:59:00Z'))).toBe('2026-08-25')
    expect(dispatchDay(new Date('2026-08-26T07:00:00Z'))).toBe('2026-08-26')
    // UTC midnight itself (5pm PDT) must NOT advance the key — the exact old bug.
    expect(dispatchDay(new Date('2026-08-26T00:00:00Z'))).toBe('2026-08-25')
  })

  it('follows the DST offset rather than a fixed one', () => {
    // PST (UTC-8) in January: 6pm local on the 15th is 02:00Z on the 16th.
    expect(dispatchDay(new Date('2026-01-16T02:00:00Z'))).toBe('2026-01-15')
    // 4:30pm PST is 00:30Z — a fixed -7 would have named the 16th here.
    expect(dispatchDay(new Date('2026-01-16T00:30:00Z'))).toBe('2026-01-15')
  })

  it('agrees with UTC during the hours the two zones share a date', () => {
    expect(dispatchDay(new Date('2026-08-25T18:00:00Z'))).toBe('2026-08-25') // 11am PDT
  })
})
