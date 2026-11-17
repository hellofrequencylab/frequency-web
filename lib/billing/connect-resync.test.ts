import { describe, it, expect, vi } from 'vitest'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('no db in tests') } }))
vi.mock('./stripe', () => ({ stripe: null, appUrl: () => 'https://x.test', billingEnabled: () => false }))
vi.mock('@/lib/platform-flags', () => ({ hostPayoutsEnabledFlag: async () => false }))

import { resyncConnectedAccounts, toStatus } from './connect'

// LIVE-2328: the daily cron re-reads every connected account and mirrors it, so payout flags stay
// current with no Connect webhook. These lock the batch: the skip, the window, the per-account
// fail-safe and the changed count.

interface Row {
  id: string
  stripe_account_id: string
  stripe_charges_enabled: boolean
  stripe_payouts_enabled: boolean
  stripe_details_submitted: boolean
}

function fakeDb(rows: Row[]) {
  const ranges: Array<[number, number]> = []
  const client = {
    from: () => ({
      select: (_cols: string, opts?: { head?: boolean }) => {
        const chain = {
          not: () => (opts?.head ? Promise.resolve({ count: rows.length, error: null }) : chain),
          order: () => chain,
          range: (from: number, to: number) => {
            ranges.push([from, to])
            return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
          },
        }
        return chain
      },
    }),
  }
  return { db: (): SupabaseClient => client as never, ranges }
}

const row = (n: number, charges = true): Row => ({
  id: `p${n}`,
  stripe_account_id: `acct_${n}`,
  stripe_charges_enabled: charges,
  stripe_payouts_enabled: true,
  stripe_details_submitted: true,
})

const account = (id: string, charges: boolean) =>
  ({ id, charges_enabled: charges, payouts_enabled: true, details_submitted: true, metadata: {} }) as unknown as Stripe.Account

const persist = vi.fn(async (a: Stripe.Account) =>
  toStatus({
    stripe_account_id: a.id,
    stripe_charges_enabled: a.charges_enabled,
    stripe_payouts_enabled: a.payouts_enabled,
    stripe_details_submitted: a.details_submitted,
  }),
)

describe('resyncConnectedAccounts', () => {
  it('skips with a reason when Stripe is not configured, and touches nothing', async () => {
    const db = vi.fn()
    const r = await resyncConnectedAccounts({ persist, limit: 200 }, { stripe: null, db })
    expect(r).toMatchObject({ skipped: 'stripe_not_configured', checked: 0 })
    expect(db).not.toHaveBeenCalled()
  })

  it('re-reads every account, mirrors it, counts a changed flag, and logs a failure without throwing', async () => {
    persist.mockClear()
    const { db } = fakeDb([row(1), row(2), row(3)])
    const retrieve = vi.fn(async (id: string) => {
      if (id === 'acct_2') throw new Error('No such account')
      return account(id, id !== 'acct_3') // acct_3 lost charges at Stripe
    })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stripe = { accounts: { retrieve } } as unknown as Pick<Stripe, 'accounts'>
    const r = await resyncConnectedAccounts({ persist, limit: 200 }, { stripe, db })
    err.mockRestore()
    expect(retrieve).toHaveBeenCalledTimes(3)
    expect(persist).toHaveBeenCalledTimes(2)
    expect(r).toEqual({ skipped: null, total: 3, checked: 2, changed: 1, failed: 1, remaining: 0 })
  })

  it('takes at most `limit` accounts and rotates the window by day', async () => {
    const { db, ranges } = fakeDb([row(1), row(2), row(3), row(4), row(5)])
    const retrieve = vi.fn(async (id: string) => account(id, true))
    const stripe = { accounts: { retrieve } } as unknown as Pick<Stripe, 'accounts'>
    const r = await resyncConnectedAccounts({ persist, limit: 2, dayIndex: 1 }, { stripe, db })
    expect(ranges).toEqual([[2, 3]])
    expect(r).toMatchObject({ total: 5, checked: 2, remaining: 3 })
  })

  it('stops when the cron clock is spent', async () => {
    const { db } = fakeDb([row(1), row(2)])
    const retrieve = vi.fn(async (id: string) => account(id, true))
    const stripe = { accounts: { retrieve } } as unknown as Pick<Stripe, 'accounts'>
    const r = await resyncConnectedAccounts({ persist, limit: 200, exhausted: () => true }, { stripe, db })
    expect(retrieve).not.toHaveBeenCalled()
    expect(r).toMatchObject({ checked: 0, remaining: 2 })
  })
})
