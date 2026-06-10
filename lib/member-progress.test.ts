import { describe, it, expect } from 'vitest'
import { deriveStage, gatesFor, nextStage, MEMBER_STAGES, type ProgressSignals } from './member-progress'

const base: ProgressSignals = {
  activationComplete: true,
  streak: 0,
  journeys: 0,
  circles: 0,
  seasonZaps: 0,
}

describe('deriveStage', () => {
  it('is newcomer until activation completes', () => {
    expect(deriveStage({ ...base, activationComplete: false, streak: 50 })).toBe('newcomer')
  })

  it('is finding_feet right after activation with no momentum', () => {
    expect(deriveStage(base)).toBe('finding_feet')
  })

  it('reaches regular via a 7-day streak or a Journey', () => {
    expect(deriveStage({ ...base, streak: 7 })).toBe('regular')
    expect(deriveStage({ ...base, journeys: 1 })).toBe('regular')
  })

  it('reaches established via 30-day streak, Signal zaps, or two Journeys', () => {
    expect(deriveStage({ ...base, streak: 30 })).toBe('established')
    expect(deriveStage({ ...base, seasonZaps: 300 })).toBe('established')
    expect(deriveStage({ ...base, journeys: 2 })).toBe('established')
  })

  it('reaches anchor via a 100-day streak or Conduit zaps', () => {
    expect(deriveStage({ ...base, streak: 100 })).toBe('anchor')
    expect(deriveStage({ ...base, seasonZaps: 1500 })).toBe('anchor')
  })

  it('is monotonic — more never demotes', () => {
    const a = deriveStage({ ...base, streak: 7 })
    const b = deriveStage({ ...base, streak: 7, seasonZaps: 1500 })
    const ai = MEMBER_STAGES.find((s) => s.key === a)!.index
    const bi = MEMBER_STAGES.find((s) => s.key === b)!.index
    expect(bi).toBeGreaterThanOrEqual(ai)
  })
})

describe('gatesFor', () => {
  it('marks a gate met once its signal crosses', () => {
    const gates = gatesFor('finding_feet', { ...base, streak: 7 })
    expect(gates.find((g) => g.label.includes('streak'))?.met).toBe(true)
    expect(gates.find((g) => g.label.includes('Journey'))?.met).toBe(false)
  })

  it('anchor is the top — no further gates', () => {
    expect(gatesFor('anchor', base)).toEqual([])
  })
})

describe('nextStage', () => {
  it('walks the ladder and stops at the top', () => {
    expect(nextStage('newcomer')?.key).toBe('finding_feet')
    expect(nextStage('established')?.key).toBe('anchor')
    expect(nextStage('anchor')).toBeNull()
  })
})
