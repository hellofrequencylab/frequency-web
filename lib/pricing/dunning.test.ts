import { describe, it, expect, vi, beforeEach } from 'vitest'

// SCAN-539 — the membership_payment_status read behind resolveMemberPaymentState (lib/pricing/dunning.ts).
//
// DIRECTION: FAIL OPEN, DELIBERATELY. This is the one site in the sweep whose ANSWER is unchanged.
// 'active' is right on an unreadable status, because the wrong answer in the other direction is a
// FALSE past-due wall in front of a member whose card is fine, and this module's whole contract is
// "never strand a paying member behind one". What was wrong is that it was an ACCIDENT: a PostgREST
// failure arrives in `error`, not as a throw, so the try/catch documented as the fail-safe never
// engaged and the unchecked null merely happened to land on 'active'. It is now a decision, and the
// error is logged, so an outage that hides every recovery banner leaves a trace instead of looking
// like a platform with no past-due members.

type Result = { data: Record<string, unknown> | null; error: { message: string } | null }

const state = vi.hoisted(() => {
  let result: Result = { data: null, error: null }
  let live = true
  return {
    get result() {
      return result
    },
    get live() {
      return live
    },
    set(r: Result) {
      result = r
    },
    setLive(v: boolean) {
      live = v
    },
  }
})

vi.mock('./settings', () => ({ billingLive: async () => state.live }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      from: () => b,
      select: () => b,
      eq: () => b,
      maybeSingle: () => Promise.resolve(state.result),
    }
    return b
  },
}))

import { resolveMemberPaymentState } from './dunning'

beforeEach(() => {
  state.set({ data: null, error: null })
  state.setLive(true)
  vi.spyOn(console, 'error').mockImplementation(() => {}).mockClear()
})

describe('resolveMemberPaymentState — an unreadable payment status (SCAN-539)', () => {
  it('reads as active (never a false past-due wall in front of a paying member)', async () => {
    state.set({ data: null, error: { message: '57014 statement timeout' } })
    expect(await resolveMemberPaymentState('m1')).toBe('active')
  })

  it('LOGS the failure, so a swallowed outage is not an invisible regression', async () => {
    state.set({ data: null, error: { message: '57014 statement timeout' } })
    await resolveMemberPaymentState('m1')
    // Old behaviour: the error was never destructured, so this path was completely silent and
    // indistinguishable from a member in good standing.
    expect(console.error).toHaveBeenCalled()
  })

  it('an absent status is not a failure: active, and nothing is logged', async () => {
    state.set({ data: null, error: null })
    expect(await resolveMemberPaymentState('m1')).toBe('active')
    expect(console.error).not.toHaveBeenCalled()
  })

  it('still surfaces a real past_due status on a clean read', async () => {
    state.set({ data: { membership_payment_status: 'past_due' }, error: null })
    expect(await resolveMemberPaymentState('m1')).toBe('past_due')
  })

  it('stays dark while billing is off, without reading anything', async () => {
    state.setLive(false)
    state.set({ data: { membership_payment_status: 'past_due' }, error: null })
    expect(await resolveMemberPaymentState('m1')).toBe('active')
  })
})
