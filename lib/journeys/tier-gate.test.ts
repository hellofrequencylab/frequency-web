import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  journeyNeedsMembershipMessage,
  journeyWrongTierMessage,
  journeyTierGateError,
} from './tier-gate'

const labels = { spaceName: 'Royal Temple', tierName: 'Patron' }

describe('journeyTierGateError', () => {
  it('is open when no tier is set', () => {
    expect(journeyTierGateError(null, null, labels)).toBeNull()
    expect(journeyTierGateError(null, { tierId: 'other', status: 'active' }, labels)).toBeNull()
  })

  it('refuses a guest and a waitlist row with the same join copy', () => {
    const copy = journeyNeedsMembershipMessage('Royal Temple', 'Patron')
    expect(journeyTierGateError('tier-1', null, labels)).toBe(copy)
    expect(journeyTierGateError('tier-1', { tierId: 'tier-1', status: 'waitlist' }, labels)).toBe(copy)
  })

  it('refuses a different active tier', () => {
    expect(journeyTierGateError('tier-1', { tierId: 'tier-2', status: 'active' }, labels)).toBe(
      journeyWrongTierMessage('Royal Temple', 'Patron'),
    )
  })

  it('clears when the active membership is that tier', () => {
    expect(journeyTierGateError('tier-1', { tierId: 'tier-1', status: 'active' }, labels)).toBeNull()
  })
})

describe('the LIVE-411 doors consult the same helper', () => {
  it('free enrol and checkout both call checkJourneyTier', () => {
    const free = readFileSync('lib/journeys/free-enrol-gate.ts', 'utf8')
    const paid = readFileSync('lib/commerce/checkout.ts', 'utf8')
    expect(free).toMatch(/checkJourneyTier/)
    expect(paid).toMatch(/checkJourneyTier/)
  })
})
