import { describe, it, expect } from 'vitest'
import {
  payoutPrompt,
  needsPayoutLine,
  listPhrase,
  normalizeChannels,
  PAYOUT_CHANNELS,
  PAYOUT_CHANNEL_WORDS,
  NEEDS_PAYOUT_ACCOUNT,
  type PayoutChannel,
} from './payout-prompt'
import { NEEDS_PAYOUT_ACCOUNT as TICKETS_LINE, ticketSellerVerdict } from '@/lib/events/ticket-eligibility'

// The kernel behind the ONE Connect onboarding prompt (LIVE-233). Pure, so every case is reachable
// without a Supabase or Stripe mock; the IO half (payout-prompt-resolve.ts) does two reads and
// nothing else, so testing it would be testing the mock (SCAN-532's lesson).

const READY = { accountId: 'acct_1', onboarded: true, ready: true }
const IN_REVIEW = { accountId: 'acct_1', onboarded: true, ready: false }
const NONE = { accountId: null, onboarded: false, ready: false }
const STARTED = { accountId: 'acct_1', onboarded: false, ready: false }

describe('needsPayoutLine', () => {
  it('is the one sentence the tickets seam already shipped', () => {
    expect(needsPayoutLine(['tickets'])).toBe(
      'Add a payout account to start selling tickets. It takes about two minutes, and the money lands in your bank.',
    )
  })

  it('is what lib/events/ticket-eligibility now re-exports (one copy of the string, not two)', () => {
    expect(TICKETS_LINE).toBe(NEEDS_PAYOUT_ACCOUNT)
    const v = ticketSellerVerdict({ payoutsReady: false })
    expect(v.allowed === false && v.reason).toBe(NEEDS_PAYOUT_ACCOUNT)
  })

  it('names every channel it covers when a surface carries several', () => {
    expect(needsPayoutLine(['memberships', 'bookings', 'donations'])).toBe(
      'Add a payout account to start taking money for memberships, bookings and donations. It takes about two minutes, and the money lands in your bank.',
    )
  })

  it('never emits an em dash (CONTENT-VOICE §10, enforced by check:canon)', () => {
    for (const c of PAYOUT_CHANNELS) expect(needsPayoutLine([c])).not.toMatch(/—/)
    expect(needsPayoutLine(PAYOUT_CHANNELS)).not.toMatch(/—/)
  })

  it('has copy for all five money paths', () => {
    expect(PAYOUT_CHANNELS).toHaveLength(5)
    for (const c of PAYOUT_CHANNELS) {
      expect(PAYOUT_CHANNEL_WORDS[c].verb).toBeTruthy()
      expect(PAYOUT_CHANNEL_WORDS[c].noun).toBeTruthy()
    }
  })
})

describe('listPhrase / normalizeChannels', () => {
  it('joins plainly with no serial comma', () => {
    expect(listPhrase(['a'])).toBe('a')
    expect(listPhrase(['a', 'b'])).toBe('a and b')
    expect(listPhrase(['a', 'b', 'c'])).toBe('a, b and c')
    expect(listPhrase([])).toBe('')
  })

  it('orders and de-duplicates so two surfaces naming the same set say the same sentence', () => {
    const a: PayoutChannel[] = ['donations', 'memberships', 'donations']
    const b: PayoutChannel[] = ['memberships', 'donations']
    expect(normalizeChannels(a)).toEqual(normalizeChannels(b))
    expect(needsPayoutLine(a)).toBe(needsPayoutLine(b))
  })
})

describe('payoutPrompt', () => {
  const base = { channels: ['memberships'] as PayoutChannel[], payoutsLive: true, relation: 'self' as const }

  it('says NOTHING to an operator who is already ready (ADR-1158: do not ask twice)', () => {
    expect(payoutPrompt({ ...base, status: READY })).toBeNull()
  })

  it('offers inline onboarding to a payee with no account', () => {
    const p = payoutPrompt({ ...base, status: NONE })
    expect(p?.state).toBe('needs_setup')
    expect(p?.action).toBe('onboard')
    expect(p?.actionLabel).toBe('Set up payouts')
    expect(p?.body).toBe(needsPayoutLine(['memberships']))
  })

  it('says FINISH, not start, when an account exists but never completed the form', () => {
    expect(payoutPrompt({ ...base, status: STARTED })?.actionLabel).toBe('Finish payout setup')
  })

  it('asks for nothing while Stripe is still verifying', () => {
    const p = payoutPrompt({ ...base, status: IN_REVIEW })
    expect(p?.state).toBe('in_review')
    expect(p?.action).toBe('resume')
  })

  it('offers no button at all when the platform payouts switch is off', () => {
    // createOnboardingLink returns null while payouts are dark, so a button here would fail silently.
    const p = payoutPrompt({ ...base, status: NONE, payoutsLive: false })
    expect(p?.state).toBe('not_live')
    expect(p?.action).toBe('none')
    expect(p?.actionLabel).toBeNull()
  })

  it('never offers a ready payee a button, even before it returns null', () => {
    const p = payoutPrompt({ ...base, status: READY, payoutsLive: false })
    expect(p?.state).toBe('not_live')
    expect(p?.action).toBe('none')
  })

  it('tells a NON-owner admin who has to act, and hands them no button', () => {
    const p = payoutPrompt({
      ...base,
      relation: 'other',
      status: NONE,
      payeeName: 'Rosewood Studio',
      channels: ['memberships', 'bookings'],
    })
    expect(p?.state).toBe('needs_setup')
    expect(p?.action).toBe('none')
    expect(p?.body).toContain('Rosewood Studio')
    expect(p?.body).toContain('memberships and bookings')
  })

  it('falls back to a neutral noun when the payee has no name', () => {
    const p = payoutPrompt({ ...base, relation: 'other', status: NONE })
    expect(p?.body).toContain('The owner')
  })

  it('prompts for setup when the payee could not be read at all (fail open on the PROMPT)', () => {
    // A failed profile read must not read as "this account is fine": staying quiet when the account
    // is missing is the failure that strands a buyer's payment. The BUY paths still fail closed.
    const p = payoutPrompt({ ...base, status: null })
    expect(p?.state).toBe('needs_setup')
    expect(p?.action).toBe('onboard')
  })

  it('carries no em dash on any arm (check:canon scans string literals on the code seam)', () => {
    const arms = [
      payoutPrompt({ ...base, status: NONE }),
      payoutPrompt({ ...base, status: STARTED }),
      payoutPrompt({ ...base, status: IN_REVIEW }),
      payoutPrompt({ ...base, status: NONE, payoutsLive: false }),
      payoutPrompt({ ...base, relation: 'other', status: NONE, payeeName: 'Rosewood Studio' }),
      payoutPrompt({ ...base, relation: 'other', status: IN_REVIEW, payeeName: 'Rosewood Studio' }),
    ]
    for (const p of arms) {
      expect(p).not.toBeNull()
      expect(`${p?.headline} ${p?.body}`).not.toMatch(/—|–/)
    }
  })
})
