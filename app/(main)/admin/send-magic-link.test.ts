import { describe, it, expect, beforeEach, vi } from 'vitest'

// SCAN-751 (2026-10-05). The members admin "Send sign-in link" button told support the email went
// out, but the action only called `admin.generateLink`, which mints a link and never sends mail.
// Locked here: the action sends through `signInWithOtp` (Supabase's mailer), never through
// `generateLink`, and a refused send surfaces as an error instead of a false success.

const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  generateLink: vi.fn(),
  caller: { id: 'staff-1', community_role: 'admin', webRole: 'janitor' } as Record<string, unknown> | null,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => mocks.caller }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { auth_user_id: 'auth-1' } }) }) }),
    }),
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      admin: {
        getUserById: async () => ({ data: { user: { id: 'auth-1', email: 'sam@example.com' } } }),
        generateLink: mocks.generateLink,
      },
    },
  }),
}))

import { sendMagicLink } from './actions'

beforeEach(() => {
  mocks.signInWithOtp.mockReset().mockResolvedValue({ data: {}, error: null })
  mocks.generateLink.mockReset().mockResolvedValue({ data: {}, error: null })
  mocks.caller = { id: 'staff-1', community_role: 'admin', webRole: 'janitor' }
})

describe('sendMagicLink', () => {
  it('sends the link through the mailer (signInWithOtp), not generateLink', async () => {
    await expect(sendMagicLink('p1')).resolves.toEqual({ email: 'sam@example.com' })
    expect(mocks.generateLink).not.toHaveBeenCalled()
    expect(mocks.signInWithOtp).toHaveBeenCalledTimes(1)
    const [arg] = mocks.signInWithOtp.mock.calls[0]
    expect(arg.email).toBe('sam@example.com')
    expect(arg.options.shouldCreateUser).toBe(false)
    expect(arg.options.emailRedirectTo).toMatch(/\/auth\/callback$/)
  })

  it('surfaces a refused send instead of reporting success', async () => {
    mocks.signInWithOtp.mockResolvedValue({ data: {}, error: { message: 'rate limited' } })
    await expect(sendMagicLink('p1')).rejects.toThrow('rate limited')
  })

  it('refuses a non-janitor caller before sending anything', async () => {
    mocks.caller = { id: 'u1', community_role: 'admin', webRole: 'member' }
    await expect(sendMagicLink('p1')).rejects.toThrow('Unauthorized')
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()
  })
})
