import { describe, expect, it } from 'vitest'
import {
  canStaffTransition,
  CONNECT_WIRED,
  LIVE_PERSONA_STATES,
  PARTNER_PERSONAS,
  PERSONA_STATE_META,
  type PersonaState,
} from './personas'

const ALL_STATES: PersonaState[] = ['claimed', 'verified', 'active', 'suspended']

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
