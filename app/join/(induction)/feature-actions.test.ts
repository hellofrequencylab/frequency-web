import { describe, it, expect, vi, beforeEach } from 'vitest'

// SCAN-745 — the feature-funnel signup bridge must only ever stash a handle that the finalizer
// (writeInduction / mergeInduction -> sanitizeProfileInput, /^[a-z0-9_]{3,30}$/) will accept.
// Before the fix a visitor named Jo who skipped the username step was stashed as @jo and bounced
// between /join/complete and /join forever, and a picked @jo_ann was silently stored as @joann.
//
// Everything the action touches is stubbed: the cookie jar, the admin client's handle-existence
// lookup, and stashPendingInduction (asserted by payload, never executed).

const setCookie = vi.fn()
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: setCookie }),
}))

const takenHandles = new Set<string>()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, h: string) => ({
          maybeSingle: async () => ({ data: takenHandles.has(h) ? { id: 'x' } : null }),
        }),
      }),
    }),
  }),
}))

const { stash } = vi.hoisted(() => ({
  stash: vi.fn(async (_data: { handle: string; displayName: string }) => {}),
}))
vi.mock('./actions', () => ({ stashPendingInduction: stash }))

import { beginFeatureFunnelSignup } from './feature-actions'

const FINALIZER_HANDLE_RE = /^[a-z0-9_]{3,30}$/

function stashedHandle(): string {
  expect(stash).toHaveBeenCalledTimes(1)
  return stash.mock.calls[0][0].handle
}

beforeEach(() => {
  takenHandles.clear()
  vi.clearAllMocks()
})

describe('beginFeatureFunnelSignup handle derivation', () => {
  it('keeps a picked handle with an underscore exactly as the visitor was shown it', async () => {
    await beginFeatureFunnelSignup({ name: 'Jo Ann', email: 'jo@example.com', seq: 'demo', handle: 'jo_ann' })
    expect(stashedHandle()).toBe('jo_ann')
  })

  it('pads a short name so a visitor named Jo who skips the username step can still finish', async () => {
    await beginFeatureFunnelSignup({ name: 'Jo', email: 'jo@example.com', seq: 'demo' })
    const h = stashedHandle()
    expect(h).toMatch(FINALIZER_HANDLE_RE)
    expect(h).toBe('jomember')
  })

  it('never stashes a handle the finalizer would reject, even for a name with no usable characters', async () => {
    await beginFeatureFunnelSignup({ name: '  ', email: 'x@example.com', seq: 'demo' })
    expect(stashedHandle()).toMatch(FINALIZER_HANDLE_RE)
  })

  it('still derives from the name when the picked handle is under three characters', async () => {
    await beginFeatureFunnelSignup({ name: 'Daniel Tyack', email: 'd@example.com', seq: 'demo', handle: 'dt' })
    expect(stashedHandle()).toBe('danieltyack')
  })

  it('suffixes a taken handle and the result still matches the finalizer shape', async () => {
    takenHandles.add('jo_ann')
    await beginFeatureFunnelSignup({ name: 'Jo Ann', email: 'jo@example.com', seq: 'demo', handle: 'jo_ann' })
    const h = stashedHandle()
    expect(h).toBe('jo_ann2')
    expect(h).toMatch(FINALIZER_HANDLE_RE)
  })
})
