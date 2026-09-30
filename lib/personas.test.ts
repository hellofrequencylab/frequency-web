import { describe, expect, it } from 'vitest'
import {
  awaitingPayout,
  canStaffTransition,
  connectBindingState,
  isMoneyPersona,
  LIVE_PERSONA_STATES,
  MONEY_PERSONAS,
  PARTNER_PERSONAS,
  personaActivationVerdict,
  personaQueueStats,
  PERSONA_NEEDS_PAYOUT,
  PERSONA_PAYOUT_HREF,
  PERSONA_STATE_META,
  type PersonaQueueRow,
  type PersonaState,
} from './personas'

const ALL_STATES: PersonaState[] = ['claimed', 'verified', 'active', 'suspended']

const NO_ACCOUNT = { accountId: null, chargesEnabled: false }
const UNFINISHED = { accountId: 'acct_1', chargesEnabled: false }
const CAN_CHARGE = { accountId: 'acct_1', chargesEnabled: true }

function row(over: Partial<PersonaQueueRow>): PersonaQueueRow {
  return {
    profileId: 'p', displayName: 'A', handle: null, avatarUrl: null,
    persona: 'practitioner', state: 'claimed', notes: null,
    createdAt: '', verifiedAt: null, stripeAccountId: null,
    ownerPayout: NO_ACCOUNT,
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
    // the ladder allows verified → active; the payout gate below decides money personas
    expect(canStaffTransition('verified', 'active')).toBe(true)
    expect(canStaffTransition('verified', 'suspended')).toBe(true)
    expect(canStaffTransition('active', 'suspended')).toBe(true)
    // reinstate a suspended persona straight to verified (no forced re-claim)
    expect(canStaffTransition('suspended', 'verified')).toBe(true)
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

describe('the payout gate at active (LIVE-696)', () => {
  it('lets a money persona go Active when its member can take charges, and binds that account', () => {
    expect(personaActivationVerdict('practitioner', CAN_CHARGE)).toEqual({ ok: true, bindAccountId: 'acct_1' })
    expect(personaActivationVerdict('organization', CAN_CHARGE)).toEqual({ ok: true, bindAccountId: 'acct_1' })
  })

  it('refuses a money persona with no account, an unfinished one, or an unreadable one, and says what to do', () => {
    for (const payout of [NO_ACCOUNT, UNFINISHED, null]) {
      expect(personaActivationVerdict('practitioner', payout)).toEqual({ ok: false, reason: PERSONA_NEEDS_PAYOUT })
    }
    // charges on without an account id is not an account
    expect(personaActivationVerdict('organization', { accountId: null, chargesEnabled: true }).ok).toBe(false)
    expect(PERSONA_NEEDS_PAYOUT).toMatch(/payout account/)
    expect(PERSONA_NEEDS_PAYOUT).toMatch(/Billing/)
    expect(PERSONA_NEEDS_PAYOUT).not.toMatch(/—/)
    expect(PERSONA_PAYOUT_HREF).toBe('/settings/billing#payouts')
  })

  it('never gates a persona that takes no money', () => {
    for (const p of ['collaborator', 'business'] as const) {
      expect(personaActivationVerdict(p, null)).toEqual({ ok: true, bindAccountId: null })
      expect(personaActivationVerdict(p, CAN_CHARGE)).toEqual({ ok: true, bindAccountId: null })
    }
  })

  it('prompts only a verified money persona that is still missing the account', () => {
    expect(awaitingPayout('practitioner', 'verified', NO_ACCOUNT)).toBe(true)
    expect(awaitingPayout('practitioner', 'verified', UNFINISHED)).toBe(true)
    expect(awaitingPayout('practitioner', 'verified', CAN_CHARGE)).toBe(false)
    expect(awaitingPayout('practitioner', 'claimed', NO_ACCOUNT)).toBe(false)
    expect(awaitingPayout('practitioner', 'active', CAN_CHARGE)).toBe(false)
    expect(awaitingPayout('collaborator', 'verified', NO_ACCOUNT)).toBe(false)
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

  it('reads the payout binding from the member account and the bound id', () => {
    // Non-money personas never carry a binding.
    expect(connectBindingState(row({ persona: 'collaborator', state: 'verified', ownerPayout: CAN_CHARGE }))).toBe('none')
    // A money persona without an account that can take charges is waiting on the member.
    expect(connectBindingState(row({ persona: 'practitioner', state: 'verified' }))).toBe('needs_account')
    expect(connectBindingState(row({ persona: 'practitioner', state: 'verified', ownerPayout: UNFINISHED }))).toBe('needs_account')
    // The member's account can take charges: Activate will bind it.
    expect(connectBindingState(row({ persona: 'practitioner', state: 'verified', ownerPayout: CAN_CHARGE }))).toBe('ready')
    // A bound account always reads bound.
    expect(connectBindingState(row({ persona: 'organization', state: 'active', stripeAccountId: 'acct_1' }))).toBe('bound')
  })
})
