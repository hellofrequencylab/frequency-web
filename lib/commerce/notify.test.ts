import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// notifySellerOfOrder — the seller alert on a settled sale (in-app + email). Locks: the seller is
// resolved per owner_kind (maker = self, Space = owner, platform = skipped), both channels fire,
// and every side effect is best-effort (a failing notification never blocks the email or throws).
const emails: Array<{ to: string; subject: string }> = []
vi.mock('@/lib/email', () => ({ enqueueEmail: vi.fn(async (p: { to: string; subject: string }) => { emails.push(p) }) }))

import { notifySellerOfOrder } from './notify'

// A chainable fake admin client covering the exact reads/writes notify makes.
function makeAdmin(opts: {
  spaceOwnerProfileId?: string | null
  sellerProfile?: { auth_user_id?: string | null; display_name?: string | null } | null
  sellerEmail?: string | null
  notifThrows?: boolean
}) {
  const notifications: Array<Record<string, unknown>> = []
  const admin = {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          if (table === 'spaces') return { data: opts.spaceOwnerProfileId ? { owner_profile_id: opts.spaceOwnerProfileId } : null }
          if (table === 'profiles') return { data: opts.sellerProfile ?? null }
          return { data: null }
        },
        insert: async (row: Record<string, unknown>) => {
          if (table === 'notifications') {
            if (opts.notifThrows) throw new Error('notif insert failed')
            notifications.push(row)
          }
          return { error: null }
        },
      }
      return chain
    },
    auth: { admin: { getUserById: async () => ({ data: { user: opts.sellerEmail ? { email: opts.sellerEmail } : null } }) } },
  }
  // eslint-disable-next-line no-restricted-syntax -- test double: a partial chainable stub of only the
  // reads/writes notify() makes, not a real client. Typing it fully would obscure the test.
  return { admin: admin as unknown as SupabaseClient, notifications }
}

const baseOrder = { id: 'order-1', buyerProfileId: 'buyer-1', amountCents: 2500, currency: 'usd' }

describe('notifySellerOfOrder', () => {
  beforeEach(() => { emails.length = 0 })

  it('notifies a Space owner (in-app + email) for a Space sale', async () => {
    const { admin, notifications } = makeAdmin({
      spaceOwnerProfileId: 'owner-1',
      sellerProfile: { auth_user_id: 'auth-1', display_name: 'Vista Studio' },
      sellerEmail: 'owner@example.com',
    })
    await notifySellerOfOrder(admin, { ...baseOrder, ownerKind: 'space', ownerProfileId: null, ownerSpaceId: 'space-1' })
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({ recipient_id: 'owner-1', actor_id: 'buyer-1', type: 'order_received', reference_id: 'order-1' })
    expect(emails).toHaveLength(1)
    expect(emails[0].to).toBe('owner@example.com')
  })

  it('notifies the maker directly for a maker (profile) sale', async () => {
    const { admin, notifications } = makeAdmin({
      sellerProfile: { auth_user_id: 'auth-2', display_name: 'Ada' },
      sellerEmail: 'ada@example.com',
    })
    await notifySellerOfOrder(admin, { ...baseOrder, ownerKind: 'profile', ownerProfileId: 'maker-1', ownerSpaceId: null })
    expect(notifications[0]).toMatchObject({ recipient_id: 'maker-1' })
    expect(emails[0].to).toBe('ada@example.com')
  })

  it('skips a platform (Frequency Store) sale — no member seller', async () => {
    const { admin, notifications } = makeAdmin({})
    await notifySellerOfOrder(admin, { ...baseOrder, ownerKind: 'platform', ownerProfileId: null, ownerSpaceId: null })
    expect(notifications).toHaveLength(0)
    expect(emails).toHaveLength(0)
  })

  it('is best-effort: a failed notification does not throw or block the email', async () => {
    const { admin } = makeAdmin({
      spaceOwnerProfileId: 'owner-1',
      sellerProfile: { auth_user_id: 'auth-1', display_name: 'Vista' },
      sellerEmail: 'owner@example.com',
      notifThrows: true,
    })
    await expect(
      notifySellerOfOrder(admin, { ...baseOrder, ownerKind: 'space', ownerProfileId: null, ownerSpaceId: 'space-1' }),
    ).resolves.toBeUndefined()
    expect(emails).toHaveLength(1)
  })

  it('sends no email when the seller has no resolvable address', async () => {
    const { admin, notifications } = makeAdmin({
      sellerProfile: { auth_user_id: 'auth-3', display_name: 'NoEmail' },
      sellerEmail: null,
    })
    await notifySellerOfOrder(admin, { ...baseOrder, ownerKind: 'profile', ownerProfileId: 'maker-2', ownerSpaceId: null })
    expect(notifications).toHaveLength(1)
    expect(emails).toHaveLength(0)
  })
})
