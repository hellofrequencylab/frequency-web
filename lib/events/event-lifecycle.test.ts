import { describe, it, expect } from 'vitest'
import { cancelAudit, reinstateAudit } from './event-lifecycle'

// H1-3 — the six event-cancel write paths all funnel through these helpers, so
// locking their shape here covers the who/when/why contract for every site.
// The helpers return the generated events Update type (which doesn't expose the
// new cancelled_* columns until types regenerate, ADR-246), so we read through
// this local shape to assert the runtime payload.
type Audit = {
  is_cancelled: boolean
  cancelled_at: string | null
  cancelled_by: string | null
  cancellation_reason: string | null
}

describe('cancelAudit', () => {
  it('records who/when/why with a reason', () => {
    const a = cancelAudit('profile-1', 'Venue flooded') as unknown as Audit
    expect(a.is_cancelled).toBe(true)
    expect(a.cancelled_by).toBe('profile-1')
    expect(a.cancellation_reason).toBe('Venue flooded')
    expect(typeof a.cancelled_at).toBe('string')
    expect(Number.isNaN(Date.parse(a.cancelled_at as string))).toBe(false) // valid ISO timestamp
  })

  it('normalises a missing actor and empty/whitespace reason to null', () => {
    const a = cancelAudit(null, '   ') as unknown as Audit
    expect(a.cancelled_by).toBeNull()
    expect(a.cancellation_reason).toBeNull()
    expect((cancelAudit(null, null) as unknown as Audit).cancellation_reason).toBeNull()
  })
})

describe('reinstateAudit', () => {
  it('clears the full cancel trail', () => {
    const r = reinstateAudit() as unknown as Audit
    expect(r).toEqual({
      is_cancelled: false,
      cancelled_at: null,
      cancelled_by: null,
      cancellation_reason: null,
    })
  })
})
