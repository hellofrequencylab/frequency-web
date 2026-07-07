import { describe, it, expect } from 'vitest'
import { canTransition, INTAKE_STATUSES, type IntakeStatus } from './intake'

// The status machine (docs §3.5) guards writes: a stale background job must never march a
// row backward (e.g. a late harvest un-applying a live Space).

describe('canTransition', () => {
  it('allows the happy path forward', () => {
    expect(canTransition('intake', 'researching')).toBe(true)
    expect(canTransition('researching', 'review')).toBe(true)
    expect(canTransition('review', 'applied')).toBe(true)
  })

  it('allows failed from any live stage and recovery from failed', () => {
    expect(canTransition('intake', 'failed')).toBe(true)
    expect(canTransition('researching', 'failed')).toBe(true)
    expect(canTransition('failed', 'researching')).toBe(true)
    expect(canTransition('failed', 'review')).toBe(true)
  })

  it('never marches applied backward', () => {
    for (const s of INTAKE_STATUSES) {
      if (s === 'applied') continue
      expect(canTransition('applied', s as IntakeStatus)).toBe(false)
    }
  })

  it('rejects a skip and a rewind', () => {
    expect(canTransition('intake', 'applied')).toBe(false) // cannot skip research
    expect(canTransition('review', 'intake')).toBe(false) // cannot rewind to intake
  })

  it('treats a no-op (same status) as allowed (idempotent writes)', () => {
    expect(canTransition('researching', 'researching')).toBe(true)
    expect(canTransition('applied', 'applied')).toBe(true)
  })
})
