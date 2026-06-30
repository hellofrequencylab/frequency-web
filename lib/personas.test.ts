import { describe, expect, it } from 'vitest'
import {
  canStaffTransition,
  connectBindingState,
  CONNECT_WIRED,
  isMoneyPersona,
  LIVE_PERSONA_STATES,
  MONEY_PERSONAS,
  PARTNER_PERSONAS,
  personaQueueStats,
  PERSONA_STATE_META,
  type PersonaQueueRow,
  type PersonaState,
} from './personas'

const ALL_STATES: PersonaState[] = ['claimed', 'verified', 'active', 'suspended']

function row(over: Partial<PersonaQueueRow>): PersonaQueueRow {
  return {
    profileId: 'p', displayName: 'A', handle: null, avatarUrl: null,
    persona: 'practitioner', state: 'claimed', notes: null,
    createdAt: '', verifiedAt: null, stripeAccountId: null,
    ...over,
  }
}

describe('persona verification state machine (P2.7)', () => {
  it('only verified + active light the matrix surfaces', () => {
    expect([...LIVE_PERSONA_STATES].sort()).toEqual(['active', 'verified'])
    // a bare claim and a suspension are NOT live
    expect((LIVE_PERSONA_STATES as readonly string[]).includes('claimed')).toBe(false)
    expect((LIVE_PERSONA_STATES as readonly string[]).includes('suspended')).toBe(false)
  })

  it('allows the verify ladder and suspends from any held state', () => {
    expect(canStaffTransition('claimed', 'verified')).toBe(true)
    expect(canStaffTransition('claimed', 'suspended')).toBe(true)
    expect(canStaffTransition('verified', 'suspended')).toBe(true)
    expect(canStaffTransition('active', 'suspended')).toBe(true)
    // reinstate a suspended persona straight to verified (no forced re-claim)
    expect(canStaffTransition('suspended', 'verified')).toBe(true)
  })

  it('gates activation on the Connect money binding (BUG-7)', () => {
    // verified → active is the money gate: allowed only once the Stripe Connect binding is wired.
    // While CONNECT_WIRED is false, activation is blocked everywhere (UI button + the action).
    expect(canStaffTransition('verified', 'active')).toBe(CONNECT_WIRED)
    if (!CONNECT_WIRED) expect(canStaffTransition('verified', 'active')).toBe(false)
  })

  it('rejects skips and illegal moves', () => {
    expect(canStaffTransition('claimed', 'active')).toBe(false) // can’t skip verify
    expect(canStaffTransition('active', 'verified')).toBe(false) // no demotion
    expect(canStaffTransition('verified', 'claimed')).toBe(false)
    expect(canStaffTransition('suspended', 'active')).toBe(false) // re-verify first
    // no self-transitions declared
    for (const s of ALL_STATES) expect(canStaffTransition(s, s)).toBe(false)
  })

  it('has metadata + tools for every persona and state', () => {
    for (const s of ALL_STATES) {
      expect(PERSONA_STATE_META[s].label).toBeTruthy()
    }
    expect(PARTNER_PERSONAS.length).toBe(4)
  })
})

describe('money personas + queue analytics (EM2-5)', () => {
  it('scopes the money paths to Practitioner + Organization only', () => {
    expect([...MONEY_PERSONAS].sort()).toEqual(['organization', 'practitioner'])
    expect(isMoneyPersona('practitioner')).toBe(true)
    expect(isMoneyPersona('organization')).toBe(true)
    expect(isMoneyPersona('collaborator')).toBe(false)
    expect(isMoneyPersona('business')).toBe(false)
  })

  it('counts the queue by lifecycle state', () => {
    const stats = personaQueueStats([
      row({ state: 'claimed' }),
      row({ state: 'claimed' }),
      row({ state: 'verified' }),
      row({ state: 'suspended' }),
    ])
    expect(stats).toEqual({ pending: 2, verified: 1, active: 0, suspended: 1 })
  })

  it('keeps the per-persona payout binding dormant until Connect lands', () => {
    // Non-money personas never carry a binding.
    expect(connectBindingState(row({ persona: 'collaborator', state: 'verified' }))).toBe('dormant')
    // A money persona reads pending once verified (waiting on Connect), dormant before that.
    expect(connectBindingState(row({ persona: 'practitioner', state: 'claimed' }))).toBe('dormant')
    expect(connectBindingState(row({ persona: 'practitioner', state: 'verified' }))).toBe('pending')
    // A real bound account always reads bound.
    expect(connectBindingState(row({ persona: 'organization', state: 'verified', stripeAccountId: 'acct_1' }))).toBe('bound')
  })
})
