import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

// THE TRIAL-ENDING NOTICE (LIVE-1132). Called from the Stripe webhook on trial_will_end. Holds still:
// only a Space plan subscription mails anyone, a half-resolvable owner mails nobody and never throws
// into the webhook, and the outbox dedupe key is the subscription id so a redelivery sends one email.

const email = vi.hoisted(() => ({ enqueueEmail: vi.fn(async () => undefined) }))
vi.mock('@/lib/email', async (orig) => ({ ...(await orig<typeof import('@/lib/email')>()), enqueueEmail: email.enqueueEmail }))

import { notifyTrialEnding } from './trial-ending-notify'

// 2026-11-19T00:00:00Z
const TRIAL_END = 1795046400

function sub(over: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return { id: 'sub_1', trial_end: TRIAL_END, metadata: { space_id: 's-1', plan: 'collective' }, ...over } as Stripe.Subscription
}

function admin(opts: {
  space?: unknown
  profile?: unknown
  user?: { email?: string | null } | null
  throwOn?: 'space'
} = {}): SupabaseClient {
  const space = 'space' in opts ? opts.space : { id: 's-1', name: 'Blue Door', slug: 'blue-door', owner_profile_id: 'p-1' }
  const profile = 'profile' in opts ? opts.profile : { display_name: 'Ada', auth_user_id: 'u-1' }
  const user = 'user' in opts ? opts.user : { email: 'ada@example.test' }
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (opts.throwOn === 'space' && table === 'spaces') throw new Error('db down')
            return { data: table === 'spaces' ? space : profile }
          },
        }),
      }),
    }),
    auth: { admin: { getUserById: async () => ({ data: { user } }) } },
  // eslint-disable-next-line no-restricted-syntax -- the function under test takes the webhook's client; this is a hand-built fake
  } as unknown as SupabaseClient
}

beforeEach(() => {
  email.enqueueEmail.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('notifyTrialEnding', () => {
  it('ignores a subscription that is not a Space plan or has no trial end', async () => {
    expect(await notifyTrialEnding(sub({ metadata: {} }), admin())).toBe(false)
    expect(await notifyTrialEnding(sub({ trial_end: null }), admin())).toBe(false)
    expect(email.enqueueEmail).not.toHaveBeenCalled()
  })

  it('mails the owner once, keyed on the subscription id, with the trial end date in UTC', async () => {
    expect(await notifyTrialEnding(sub(), admin())).toBe(true)
    expect(email.enqueueEmail).toHaveBeenCalledTimes(1)
    const calls = email.enqueueEmail.mock.calls as unknown as [{ to: string; html: string }, { dedupeKey: string }][]
    const [payload, opts] = calls[0]
    expect(opts).toEqual({ dedupeKey: 'trial_will_end:sub_1' })
    expect(payload.to).toBe('ada@example.test')
    expect(payload.html).toContain('November 19, 2026')
    expect(payload.html).toContain('Blue Door')
    expect(payload.html).toContain('/spaces/blue-door/settings/billing')
  })

  it('mails nobody when the owner cannot be resolved to an address', async () => {
    expect(await notifyTrialEnding(sub(), admin({ space: null }))).toBe(false)
    expect(await notifyTrialEnding(sub(), admin({ space: { owner_profile_id: null } }))).toBe(false)
    expect(await notifyTrialEnding(sub(), admin({ profile: { display_name: 'Ada', auth_user_id: null } }))).toBe(false)
    expect(await notifyTrialEnding(sub(), admin({ user: { email: null } }))).toBe(false)
    expect(email.enqueueEmail).not.toHaveBeenCalled()
  })

  it('swallows a failure so the webhook still answers Stripe', async () => {
    expect(await notifyTrialEnding(sub(), admin({ throwOn: 'space' }))).toBe(false)
    expect(email.enqueueEmail).not.toHaveBeenCalled()
  })
})
