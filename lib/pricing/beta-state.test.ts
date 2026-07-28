import { describe, it, expect, afterEach, vi } from 'vitest'

// THE BETA STATE (ADR-875) — the ONE reader every surface asks "where does this account stand in the
// beta push". Composed for real here over mocked readers, because the whole point of the module is
// that three surfaces must not derive this story three different ways.
//
// The case that matters most: THE THREE CASH-PAYING SPACES (ADR-872) must never see the founder
// invite. They are excluded by what the database says about them (an active `space_billing_agreements`
// row, plus their Founding Business row), never by a hardcoded id list, so a fourth cash deal signed
// tomorrow is excluded the moment its agreement is recorded, with no code change.

interface Scenario {
  /** billingLive() — is checkout real. Default true. */
  selling?: boolean
  /** The `beta_grace` window. Default an open window (the clock is faked into it). */
  until?: string | null
  /** The founding_members row this subject has, or null. */
  founding?: { status: 'reserved' | 'active' | 'lapsed' } | null
  /** An ACTIVE off-Stripe billing agreement for this Space, or null. */
  agreement?: { id: string } | null
  /** Make the founding read explode (the fail-quiet case). */
  foundingThrows?: boolean
}

async function loadState(s: Scenario) {
  vi.resetModules()
  vi.doMock('./settings', () => ({
    billingLive: async () => s.selling !== false,
    getBetaGrace: async () => ({ until: s.until === undefined ? '2026-09-01' : s.until }),
  }))
  vi.doMock('@/lib/founding/status', () => ({
    getFoundingStatus: async () => {
      if (s.foundingThrows) throw new Error('founding_members is unreachable')
      return s.founding ?? null
    },
  }))
  vi.doMock('@/lib/billing/manual-agreements', () => ({
    activeAgreementForSpace: async () => s.agreement ?? null,
  }))
  return await import('./beta-state')
}

afterEach(() => {
  vi.useRealTimers()
  vi.doUnmock('./settings')
  vi.doUnmock('@/lib/founding/status')
  vi.doUnmock('@/lib/billing/manual-agreements')
  vi.resetModules()
})

/** Freeze the clock deep inside the beta window. */
function duringBeta() {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-15T12:00:00Z'))
}

describe('readBetaState — the window', () => {
  it('inside the window with billing on: the invite is open and the date is carried', async () => {
    duringBeta()
    const { readBetaState } = await loadState({})
    const state = await readBetaState({ profileId: 'p-1' })
    expect(state.graceActive).toBe(true)
    expect(state.selling).toBe(true)
    expect(state.inviteOpen).toBe(true)
    expect(state.graceEndsAtMs).toBe(Date.parse('2026-09-01T00:00:00.000Z'))
  })

  it('after the window closes, the invite closes with it', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-02T00:00:00Z'))
    const { readBetaState } = await loadState({})
    const state = await readBetaState({ profileId: 'p-1' })
    expect(state.graceActive).toBe(false)
    expect(state.inviteOpen).toBe(false)
  })

  it('with billing OFF there is no invite, because there is no checkout behind it', async () => {
    duringBeta()
    const { readBetaState } = await loadState({ selling: false })
    const state = await readBetaState({ profileId: 'p-1' })
    expect(state.graceActive).toBe(true) // the window is open
    expect(state.selling).toBe(false)
    expect(state.inviteOpen).toBe(false) // but nothing to sell
  })

  it('with the window CLEARED by an operator there is no beta story to tell', async () => {
    duringBeta()
    const { readBetaState } = await loadState({ until: null })
    const state = await readBetaState({ profileId: 'p-1' })
    expect(state.graceActive).toBe(false)
    expect(state.graceEndsAtMs).toBeNull()
    expect(state.inviteOpen).toBe(false)
  })
})

describe('readBetaState — who is already in', () => {
  it('an ACTIVE founder is never invited to become one', async () => {
    duringBeta()
    const { readBetaState } = await loadState({ founding: { status: 'active' } })
    const state = await readBetaState({ profileId: 'p-1' })
    expect(state.isFounding).toBe(true)
    expect(state.inviteOpen).toBe(false)
  })

  it('a RESERVED founder has already answered the call, so the invite stays quiet', async () => {
    duringBeta()
    const { readBetaState } = await loadState({ founding: { status: 'reserved' } })
    const state = await readBetaState({ spaceId: 's-1' })
    expect(state.isFounding).toBe(true)
    expect(state.inviteOpen).toBe(false)
  })

  it('a LAPSED founder fell out of the cohort and hears the invite again', async () => {
    duringBeta()
    const { readBetaState } = await loadState({ founding: { status: 'lapsed' } })
    const state = await readBetaState({ spaceId: 's-1' })
    expect(state.isFounding).toBe(false)
    expect(state.inviteOpen).toBe(true)
  })
})

describe('readBetaState — the three cash-paying Spaces (ADR-872)', () => {
  it('an ACTIVE off-Stripe agreement suppresses the invite, by the record and not by an id list', async () => {
    duringBeta()
    const { readBetaState } = await loadState({ agreement: { id: 'agr-1' } })
    const state = await readBetaState({ spaceId: 's-cash' })
    expect(state.hasBillingAgreement).toBe(true)
    expect(state.inviteOpen).toBe(false)
  })

  it('the real shape of the three: Founding Business AND paying cash, doubly excluded', async () => {
    duringBeta()
    const { readBetaState } = await loadState({
      founding: { status: 'active' },
      agreement: { id: 'agr-1' },
    })
    const state = await readBetaState({ spaceId: 's-cash' })
    expect(state.isFounding).toBe(true)
    expect(state.hasBillingAgreement).toBe(true)
    expect(state.inviteOpen).toBe(false)
  })

  it('a Space with NO agreement is still invited (nothing is hardcoded about which Spaces these are)', async () => {
    duringBeta()
    const { readBetaState } = await loadState({ agreement: null })
    const state = await readBetaState({ spaceId: 's-other' })
    expect(state.hasBillingAgreement).toBe(false)
    expect(state.inviteOpen).toBe(true)
  })

  it('the agreement read is skipped entirely for a member subject (no Space, no query)', async () => {
    duringBeta()
    const { readBetaState } = await loadState({ agreement: { id: 'agr-1' } })
    const state = await readBetaState({ profileId: 'p-1' })
    expect(state.hasBillingAgreement).toBe(false)
  })
})

describe('readBetaState — fail-quiet', () => {
  it('a read that explodes silences the invite rather than showing it to somebody who paid', async () => {
    duringBeta()
    const { readBetaState } = await loadState({ foundingThrows: true })
    const state = await readBetaState({ profileId: 'p-1' })
    expect(state.inviteOpen).toBe(false)
  })

  it('with NO subject at all it still answers the window questions (the operator readout)', async () => {
    duringBeta()
    const { readBetaState } = await loadState({})
    const state = await readBetaState()
    expect(state.graceActive).toBe(true)
    expect(state.selling).toBe(true)
    expect(state.graceEndsAtMs).toBe(Date.parse('2026-09-01T00:00:00.000Z'))
  })
})
