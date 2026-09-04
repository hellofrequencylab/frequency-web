import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { toStatus } from './connect'

// `toStatus` is the pure derivation the UI and webhook both rely on: it maps the
// mirrored Stripe flags into onboarded/ready. Lock its truth table down.
describe('toStatus', () => {
  it('returns an empty, not-ready status for a null row (no account)', () => {
    const s = toStatus(null)
    expect(s.accountId).toBeNull()
    expect(s.chargesEnabled).toBe(false)
    expect(s.payoutsEnabled).toBe(false)
    expect(s.detailsSubmitted).toBe(false)
    expect(s.onboarded).toBe(false)
    expect(s.ready).toBe(false)
  })

  it('treats null flag columns as false (defensive against pre-migration rows)', () => {
    const s = toStatus({
      stripe_account_id: 'acct_1',
      stripe_charges_enabled: null,
      stripe_payouts_enabled: null,
      stripe_details_submitted: null,
    })
    expect(s.accountId).toBe('acct_1')
    expect(s.onboarded).toBe(false)
    expect(s.ready).toBe(false)
  })

  it('is onboarded once details are submitted, even before review clears', () => {
    const s = toStatus({
      stripe_account_id: 'acct_1',
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_details_submitted: true,
    })
    expect(s.onboarded).toBe(true)
    expect(s.ready).toBe(false)
  })

  it('is ready ONLY when charges AND payouts are both enabled', () => {
    const chargesOnly = toStatus({
      stripe_account_id: 'acct_1',
      stripe_charges_enabled: true,
      stripe_payouts_enabled: false,
      stripe_details_submitted: true,
    })
    expect(chargesOnly.ready).toBe(false)

    const payoutsOnly = toStatus({
      stripe_account_id: 'acct_1',
      stripe_charges_enabled: false,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
    })
    expect(payoutsOnly.ready).toBe(false)

    const both = toStatus({
      stripe_account_id: 'acct_1',
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
    })
    expect(both.ready).toBe(true)
  })
})

// ── THE CREATE-OR-REUSE DECISION (2026-09-04) ───────────────────────────────────────────────────
//
// WHAT BROKE, in production, on the day payouts were first switched on.
//
// `COLS` — the column list every Connect read shares — ended `…, email, display_name`, and
// `profiles.email` has never existed. PostgREST rejects a select naming an unknown column, so the
// query returned `{ data: null, error: 42703 }` every single time. Every caller destructured only
// `data`. A failed query and a profile with no Stripe account are both `null`, so the failure did
// not look like a failure; it looked like a fact.
//
// Two things followed, and neither raised anything:
//   · the settings card offered "Set up payouts" to an operator whose account already existed
//   · `getOrCreateConnectedAccount` took the CREATE branch on every click, minting a duplicate
//     Express account each time — orphaned from the `acct_…` already on the profile
//
// The column list is now `satisfies readonly ProfileColumn[]` against the GENERATED schema types, so
// re-adding `email` is a compile error naming the column (verified by mutation: tsc reports
// TS2322 on that line). These tests cover the other half — that a read we could not trust can never
// be mistaken for a profile that needs an account.

import { connectReadOutcome } from './connect'

describe('connectReadOutcome: a failed read is not an absent account', () => {
  it('reuses the existing account rather than making a second one', () => {
    expect(
      connectReadOutcome(
        {
          stripe_account_id: 'acct_1U47bWBBboHg5HWM',
          stripe_charges_enabled: false,
          stripe_payouts_enabled: false,
          stripe_details_submitted: false,
        },
        null,
      ),
    ).toEqual({ kind: 'existing', accountId: 'acct_1U47bWBBboHg5HWM' })
  })

  it('creates only when the profile genuinely has no account', () => {
    expect(
      connectReadOutcome(
        {
          stripe_account_id: null,
          stripe_charges_enabled: null,
          stripe_payouts_enabled: null,
          stripe_details_submitted: null,
          display_name: 'Daniel Tyack',
        },
        null,
      ),
    ).toEqual({ kind: 'create', displayName: 'Daniel Tyack' })
  })

  it('REFUSES to decide when the query failed, even though data is null', () => {
    // The exact production shape: PostgREST 42703 on an unknown column, data null alongside it.
    const outcome = connectReadOutcome(null, { message: 'column profiles.email does not exist' })
    expect(outcome.kind).toBe('unknown')
    expect(outcome.kind === 'unknown' && outcome.message).toContain('email')
  })

  it('refuses even when a row came back WITH an account beside the error', () => {
    // Belt and braces: an error means the result is untrustworthy whatever else is in the envelope,
    // so the error branch is checked before the row is read at all.
    expect(
      connectReadOutcome(
        {
          stripe_account_id: 'acct_1',
          stripe_charges_enabled: true,
          stripe_payouts_enabled: true,
          stripe_details_submitted: true,
        },
        { message: 'timeout' },
      ).kind,
    ).toBe('unknown')
  })

  it('a missing display name is not an error, just an absent prefill', () => {
    expect(
      connectReadOutcome(
        {
          stripe_account_id: null,
          stripe_charges_enabled: null,
          stripe_payouts_enabled: null,
          stripe_details_submitted: null,
        },
        undefined,
      ),
    ).toEqual({ kind: 'create', displayName: null })
  })
})

describe('the Connect column list stays bound to the real schema', () => {
  it('is type-checked against the generated types, not a hand-written string', () => {
    // The ratchet on the fix itself: replacing this with a plain string literal would compile, and
    // would reintroduce a silent 42703 the moment someone adds a column that is not there.
    const src = readFileSync(new URL('./connect.ts', import.meta.url), 'utf8')
    expect(src).toContain('satisfies readonly ProfileColumn[]')
    expect(src).toContain("keyof Database['public']['Tables']['profiles']['Row']")
  })

  it('names no column the generated profiles Row does not have', () => {
    // A runtime mirror of the compile-time guard, so the failure is also legible in `pnpm test`.
    const src = readFileSync(new URL('./connect.ts', import.meta.url), 'utf8')
    const block = src.slice(src.indexOf('const CONNECT_COLUMNS = ['), src.indexOf('] as const satisfies'))
    const selected = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(selected.length).toBeGreaterThan(3)

    const types = readFileSync(new URL('../database.types.ts', import.meta.url), 'utf8')
    const profiles = types.slice(types.indexOf('      profiles: {'))
    const row = profiles.slice(profiles.indexOf('Row: {'), profiles.indexOf('Insert: {'))
    const known = new Set([...row.matchAll(/^\s{10,}(\w+):/gm)].map((m) => m[1]))
    expect(known.has('stripe_account_id')).toBe(true)
    expect(known.has('email')).toBe(false) // the column that started this

    expect(selected.filter((c) => !known.has(c))).toEqual([])
  })
})
