import { describe, it, expect, beforeEach, vi } from 'vitest'

// CIRCLE INVITE LINK (createHostInviteLink). The bug this locks: the action hard-checked
// `circles.host_id` while the card that renders it — and its own sibling control, inviteByEmail —
// gate on `circle.editSettings`. A circle-scoped Admin (ADR-1014), a janitor, or the guide who
// leads the parent hub could email an invite but got nothing from the link button.
//
// What is locked here, all network-free (the admin client, auth and the capability gate are
// mocked, mirroring invite-by-email.test.ts):
//   1. A manager who is NOT the host_id (the ADR-1014 Admin case) DOES get a link.
//   2. The host still gets one.
//   3. A caller without `circle.editSettings` is refused, and nothing is written.
//   4. The refusal is RETURNED, not thrown, so the client can render it.
//   5. A missing Circle is refused before any write.

let currentProfileId: string | null = 'admin-0000-4000-a000-0000000admin'
let hasEditSettings = true
let circleExists = true
let inviteInsertError: { message: string } | null = null
const inviteInserts: Record<string, unknown>[] = []
const deactivated: string[] = []

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => currentProfileId }))

vi.mock('@/lib/core/load-capabilities', () => ({
  getCircleCapabilities: async () => new Set(hasEditSettings ? ['circle.editSettings'] : []),
}))

vi.mock('@/lib/email', () => ({ sendInviteEmail: vi.fn(async () => {}) }))
vi.mock('@/lib/site', () => ({ SITE_URL: 'https://frequencylocal.com' }))

// Module-level imports of circles/actions.ts that are not on this path.
vi.mock('@/lib/achievements', () => ({ processGamificationEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/gems', () => ({ awardGems: vi.fn(async () => {}) }))
vi.mock('@/lib/analytics/track', () => ({ track: vi.fn(async () => {}) }))
vi.mock('@/lib/ai/circle-spark', () => ({
  suggestCircleDraft: vi.fn(async () => null),
  fallbackCircleSuggestion: vi.fn(() => ({})),
}))
vi.mock('@/lib/beta/referral-contest', () => ({ recordCircleStarterMilestone: vi.fn(async () => {}) }))

// Admin client: the circles existence read, the "deactivate previous links" update, and the insert.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'circles') {
              return { data: circleExists ? { id: 'circle-1' } : null, error: null }
            }
            return { data: null, error: null }
          },
        }),
      }),
      update: () => ({
        eq: (_col: string, val: string) => ({
          eq: async () => {
            if (table === 'invite_links') deactivated.push(val)
            return { error: null }
          },
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        if (table === 'invite_links') inviteInserts.push(row)
        return Promise.resolve({ error: inviteInsertError })
      },
    }),
  }),
}))

import { createHostInviteLink } from './actions'
import { isError } from '@/lib/action-result'

beforeEach(() => {
  currentProfileId = 'admin-0000-4000-a000-0000000admin'
  hasEditSettings = true
  circleExists = true
  inviteInsertError = null
  inviteInserts.length = 0
  deactivated.length = 0
})

describe('createHostInviteLink — gated on circle.editSettings, exactly like inviteByEmail', () => {
  it('a manager who is NOT the circle host_id gets a link (the ADR-1014 Admin case)', async () => {
    // The old gate compared circles.host_id to the caller; this caller is a circle Admin, a
    // janitor or a parent-hub guide — holds circle.editSettings, owns nothing.
    const res = await createHostInviteLink('circle-1')
    expect(isError(res)).toBe(false)
    if (isError(res)) return
    expect(res.data.token).toBeTruthy()
    expect(inviteInserts).toHaveLength(1)
    expect(inviteInserts[0]).toMatchObject({
      circle_id: 'circle-1',
      created_by: 'admin-0000-4000-a000-0000000admin',
    })
    // The previous active link for this circle is retired first.
    expect(deactivated).toEqual(['circle-1'])
  })

  it('the host still gets a link', async () => {
    currentProfileId = 'host-0000-4000-a000-00000000host'
    const res = await createHostInviteLink('circle-1')
    expect(isError(res)).toBe(false)
    expect(inviteInserts).toHaveLength(1)
  })

  it('refuses a caller who does not manage the circle, and writes nothing', async () => {
    hasEditSettings = false
    const res = await createHostInviteLink('circle-1')
    expect(isError(res)).toBe(true)
    if (!isError(res)) return
    expect(res.error).toBe('You do not manage this circle.')
    expect(inviteInserts).toHaveLength(0)
  })

  it('refuses an anonymous caller', async () => {
    currentProfileId = null
    const res = await createHostInviteLink('circle-1')
    expect(isError(res)).toBe(true)
    expect(inviteInserts).toHaveLength(0)
  })

  it('refuses a missing circle before writing', async () => {
    circleExists = false
    const res = await createHostInviteLink('circle-1')
    expect(isError(res)).toBe(true)
    if (!isError(res)) return
    expect(res.error).toBe('Circle not found.')
    expect(inviteInserts).toHaveLength(0)
  })

  it('RETURNS a write failure instead of throwing, so the client can render it', async () => {
    inviteInsertError = { message: 'duplicate key value' }
    // Resolves — a rejected promise here is what became an invisible console line in the client.
    const res = await createHostInviteLink('circle-1')
    expect(isError(res)).toBe(true)
    if (!isError(res)) return
    expect(res.error).toBe('Could not create an invite link. Try again in a moment.')
    // The raw DB message never reaches the member.
    expect(res.error).not.toContain('duplicate key')
  })
})
