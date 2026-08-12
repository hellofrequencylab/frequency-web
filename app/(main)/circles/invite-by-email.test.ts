import { describe, it, expect, beforeEach, vi } from 'vitest'

// CIRCLE INVITE-BY-EMAIL (inviteByEmail). What is locked here, all network-free (the admin client,
// auth, capability gate, and the email sender are mocked, mirroring the repo's action tests):
//   1. A host (circle.editSettings) inviting an email creates a fresh invite link AND enqueues the
//      invite email with the /join/<token> link, in the Circle context.
//   2. FAIL-SAFE: a mail hiccup (the sender throws) does NOT fail invite creation.
//   3. GATED: a caller who does not manage the Circle is refused and no email is sent.
//   4. VALIDATION: junk email is refused before any write / send.

// ── Spies hoisted so the vi.mock factories can close over them. ──
const { sendInviteEmail } = vi.hoisted(() => ({
  sendInviteEmail: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
}))

// Mutable scenario state the mocks read (initialized before any test invokes the action).
let currentProfileId: string | null = 'host-0000-4000-a000-00000000host'
let hasEditSettings = true
let inviteInsertError: unknown = null
const inviteInserts: Record<string, unknown>[] = []

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => currentProfileId }))

vi.mock('@/lib/core/load-capabilities', () => ({
  getCircleCapabilities: async () => new Set(hasEditSettings ? ['circle.editSettings'] : []),
}))

vi.mock('@/lib/email', () => ({ sendInviteEmail }))
vi.mock('@/lib/site', () => ({ SITE_URL: 'https://frequencylocal.com' }))

// The other module-level imports of circles/actions.ts are not on the inviteByEmail path; mock them
// so importing the module never drags their graphs into the test.
vi.mock('@/lib/achievements', () => ({ processGamificationEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/gems', () => ({ awardGems: vi.fn(async () => {}) }))
vi.mock('@/lib/analytics/track', () => ({ track: vi.fn(async () => {}) }))
vi.mock('@/lib/ai/circle-wizard', () => ({
  suggestCircleDraft: vi.fn(async () => null),
  fallbackCircleSuggestion: vi.fn(() => ({})),
}))
vi.mock('@/lib/beta/referral-contest', () => ({ recordCircleStarterMilestone: vi.fn(async () => {}) }))

// Admin client: circles.name + profiles.display_name reads, and the invite_links insert.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'circles') return { data: { name: 'Sunset Circle' }, error: null }
            if (table === 'profiles') return { data: { display_name: 'Ada' }, error: null }
            return { data: null, error: null }
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

import { inviteByEmail } from './actions'

beforeEach(() => {
  currentProfileId = 'host-0000-4000-a000-00000000host'
  hasEditSettings = true
  inviteInsertError = null
  inviteInserts.length = 0
  sendInviteEmail.mockClear()
  sendInviteEmail.mockResolvedValue(undefined)
})

describe('inviteByEmail — enqueues the Circle invite email with the join link', () => {
  it('a host invite creates a link and emails the join URL (Circle context)', async () => {
    const res = await inviteByEmail('circle-1', 'Friend@Example.com')
    expect(res.ok).toBe(true)
    expect(inviteInserts).toHaveLength(1)
    const token = inviteInserts[0].token as string
    expect(token).toBeTruthy()
    expect(sendInviteEmail).toHaveBeenCalledTimes(1)
    expect(sendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'friend@example.com', // normalized
        inviterName: 'Ada',
        contextName: 'Sunset Circle',
        contextKind: 'circle',
        inviteUrl: `https://frequencylocal.com/join/${token}`,
      }),
    )
  })

  it('a mail hiccup does NOT fail invite creation (fail-safe)', async () => {
    sendInviteEmail.mockRejectedValueOnce(new Error('queue down'))
    const res = await inviteByEmail('circle-1', 'friend@example.com')
    expect(res.ok).toBe(true) // the link was created; the email is best-effort
    expect(inviteInserts).toHaveLength(1)
  })

  it('refuses a caller who does not manage the Circle (nothing sent)', async () => {
    hasEditSettings = false
    const res = await inviteByEmail('circle-1', 'friend@example.com')
    expect(res.ok).toBe(false)
    expect(inviteInserts).toHaveLength(0)
    expect(sendInviteEmail).not.toHaveBeenCalled()
  })

  it('refuses junk email before any write or send', async () => {
    const res = await inviteByEmail('circle-1', 'not-an-email')
    expect(res.ok).toBe(false)
    expect(inviteInserts).toHaveLength(0)
    expect(sendInviteEmail).not.toHaveBeenCalled()
  })
})
