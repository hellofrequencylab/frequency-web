// LIVE-549 (ADR-1581): deleting an account erases the copies the cascade cannot reach (stored
// files, the Stripe customer) BEFORE the auth user goes, idempotently, and never lets a failure
// there block the member from leaving.
// LIVE-628 (ADR-1601): the delete dialog is told which Spaces' paid plans that customer delete ends.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const PROFILE = 'p-1'
const AUTH = '11111111-2222-4333-8444-555555555555'
const calls: string[] = []

let files: Record<string, Record<string, { name: string; id: string | null }[]>> = {}
let removeError: string | null = null
let delImpl: (id: string) => Promise<unknown> = async () => ({ deleted: true })
let deleteUserError: string | null = null
let customerId: string | null = 'cus_123'
let profileError: string | null = null
type SpaceRow = { name: string; brand_name: string | null; plan: string | null; stripe_subscription_id: string | null; stripe_customer_id: string | null }
let spaceRows: SpaceRow[] = []
let spacesError: string | null = null

const captureMessage = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureMessage: (...a: unknown[]) => captureMessage(...a) }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => PROFILE }))
vi.mock('@/lib/billing/stripe', () => ({
  get stripe() {
    return {
      customers: {
        del: (id: string) => {
          calls.push(`stripe.del:${id}`)
          return delImpl(id)
        },
      },
    }
  },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: profileError ? null : { auth_user_id: AUTH, stripe_customer_id: customerId },
                error: profileError ? { message: profileError } : null,
              }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          eq: async (col: string, v: string) => {
            calls.push(`${table}.select:${col}=${v}`)
            if (spacesError) return { data: null, error: { message: spacesError } }
            return { data: spaceRows.filter((r) => r[col as keyof SpaceRow] === v), error: null }
          },
        }),
        update: () => ({
          eq: async (_c: string, v: string) => {
            calls.push(`${table}.clear:${v}`)
            return { error: null }
          },
        }),
      }
    },
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => ({ data: files[bucket]?.[prefix] ?? [], error: null }),
        remove: async (paths: string[]) => {
          calls.push(`remove:${bucket}:${paths.join(',')}`)
          return { error: removeError ? { message: removeError } : null }
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          calls.push(`deleteUser:${id}`)
          return { error: deleteUserError ? { message: deleteUserError } : null }
        },
      },
    },
  }),
}))

import { deleteMyAccount, paidSpacesEndedByDelete } from './account'

beforeEach(() => {
  calls.length = 0
  captureMessage.mockClear()
  removeError = null
  deleteUserError = null
  customerId = 'cus_123'
  profileError = null
  spaceRows = []
  spacesError = null
  delImpl = async () => ({ deleted: true })
  files = {
    avatars: {
      [AUTH]: [
        { name: 'avatar.jpg', id: 'o1' },
        { name: 'spotlight', id: null },
      ],
      [`${AUTH}/spotlight`]: [{ name: 'a.png', id: 'o2' }],
    },
    posts: { [AUTH]: [{ name: '1-pic.jpg', id: 'o3' }] },
  }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('deleteMyAccount erases external copies first (LIVE-549)', () => {
  it('removes every stored file, nested folders included, and deletes the Stripe customer before the auth user', async () => {
    expect(await deleteMyAccount()).toEqual({ ok: true })
    expect(calls).toEqual([
      `remove:avatars:${AUTH}/avatar.jpg,${AUTH}/spotlight/a.png`,
      `remove:posts:${AUTH}/1-pic.jpg`,
      'stripe.del:cus_123',
      'spaces.clear:cus_123',
      `deleteUser:${AUTH}`,
    ])
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('is idempotent: a customer Stripe no longer has is success, not a failure', async () => {
    delImpl = async () => {
      throw Object.assign(new Error('No such customer'), { code: 'resource_missing', statusCode: 404 })
    }
    files = {}
    expect(await deleteMyAccount()).toEqual({ ok: true })
    expect(calls).toEqual(['stripe.del:cus_123', 'spaces.clear:cus_123', `deleteUser:${AUTH}`])
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('reports a storage or Stripe failure and still deletes the auth user', async () => {
    removeError = 'boom'
    delImpl = async () => {
      throw Object.assign(new Error('rate limited'), { statusCode: 429 })
    }
    expect(await deleteMyAccount()).toEqual({ ok: true })
    expect(calls.at(-1)).toBe(`deleteUser:${AUTH}`)
    expect(calls).not.toContain('spaces.clear:cus_123')
    expect(captureMessage).toHaveBeenCalledTimes(1)
    const extra = (captureMessage.mock.calls[0][1] as { extra: { profileId: string; failures: string[] } }).extra
    expect(extra.profileId).toBe(PROFILE)
    expect(extra.failures.join(' ')).toMatch(/storage avatars: boom/)
    expect(extra.failures.join(' ')).toMatch(/stripe cus_123: rate limited/)
  })

  it('touches no Stripe customer when the member never had one', async () => {
    customerId = null
    files = {}
    expect(await deleteMyAccount()).toEqual({ ok: true })
    expect(calls).toEqual([`deleteUser:${AUTH}`])
  })
})

describe('deleteMyAccount reports a failed auth delete (the CodeQL 287 dead branch, now exercised)', () => {
  it('returns ok: false when the auth user cannot be deleted, after the external copies went first', async () => {
    deleteUserError = 'auth down'
    expect(await deleteMyAccount()).toEqual({ ok: false })
    expect(calls.indexOf('stripe.del:cus_123')).toBeLessThan(calls.indexOf(`deleteUser:${AUTH}`))
    expect(calls.at(-1)).toBe(`deleteUser:${AUTH}`)
    expect(console.error).toHaveBeenCalledWith('[deleteMyAccount]', 'auth down')
  })
})

describe('paidSpacesEndedByDelete names the plans the customer delete cancels (LIVE-628)', () => {
  const row = (over: Partial<SpaceRow>): SpaceRow => ({
    name: 'Space',
    brand_name: null,
    plan: 'business',
    stripe_subscription_id: 'sub_1',
    stripe_customer_id: 'cus_123',
    ...over,
  })

  it('lists every paid, subscribed Space billed to the member customer, by display name and plan label', async () => {
    spaceRows = [
      row({ name: 'Zinnia Hall', plan: 'nonprofit' }),
      row({ name: 'raw name', brand_name: 'Anchor Studio', plan: 'collective' }),
    ]
    expect(await paidSpacesEndedByDelete()).toEqual([
      { name: 'Anchor Studio', plan: 'Collective' },
      { name: 'Zinnia Hall', plan: 'Non Profit' },
    ])
    expect(calls).toEqual(['spaces.select:stripe_customer_id=cus_123'])
  })

  it('leaves out a free Space, one with no live subscription, and one billed to another customer', async () => {
    spaceRows = [
      row({ name: 'Free one', plan: 'free' }),
      row({ name: 'Comped', stripe_subscription_id: null }),
      row({ name: 'Someone else', stripe_customer_id: 'cus_other' }),
    ]
    expect(await paidSpacesEndedByDelete()).toEqual([])
  })

  it('reads no Space at all when the member has no Stripe customer', async () => {
    customerId = null
    spaceRows = [row({ stripe_customer_id: null })]
    expect(await paidSpacesEndedByDelete()).toEqual([])
    expect(calls).toEqual([])
  })

  it('returns null, not an empty list, when either read fails, so the dialog never claims there is nothing', async () => {
    spacesError = 'db down'
    expect(await paidSpacesEndedByDelete()).toBeNull()
    spacesError = null
    profileError = 'db down'
    expect(await paidSpacesEndedByDelete()).toBeNull()
  })
})
