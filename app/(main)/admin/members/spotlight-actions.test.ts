import { describe, it, expect, vi, beforeEach } from 'vitest'

// Janitor Spotlight switches (scan2 L6-09): each reads the target's spotlight sub-object and merges
// ONLY the `spotlight` key server-side. resetSpotlightToDefault's profile_theme column is a second,
// checked update after the merge landed (the RPC's column allowlist is the two streak mirrors only).

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  logAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
  meta: {} as Record<string, unknown>,
  updates: [] as unknown[],
  updateError: null as { message: string } | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'auth-j' } } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: () => ({
      select: (cols: string) => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: cols.includes('web_role') ? { id: 'janitor-1', web_role: 'janitor' } : { meta: mocks.meta },
            error: null,
          }),
        }),
      }),
      update: (p: unknown) => {
        mocks.updates.push(p)
        return { eq: async () => ({ error: mocks.updateError }) }
      },
    }),
  }),
}))
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: mocks.logAdminAction }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { toggleSpotlightEnabled, resetSpotlightToDefault, forceUnpublishSpotlight } from './spotlight-actions'

const PID = '00000000-0000-4000-8000-000000000001'

function patch() {
  return (mocks.rpc.mock.calls[0] as [string, { p_profile_id: string; p_patch: Record<string, unknown> }])[1]
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updates.length = 0
  mocks.updateError = null
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
  mocks.logAdminAction.mockResolvedValue(undefined)
  mocks.meta = { practiceStreak: { current: 4 }, spotlight: { enabled: true, published: true, layout: { rows: [] } } }
})

describe('toggleSpotlightEnabled', () => {
  it('merges only the spotlight key (keeping published), never a whole-blob update', async () => {
    await toggleSpotlightEnabled(PID, false)
    expect(mocks.updates).toEqual([])
    expect(patch().p_profile_id).toBe(PID)
    expect(patch().p_patch).toEqual({ spotlight: { enabled: false, published: true, layout: { rows: [] } } })
    expect(mocks.logAdminAction).toHaveBeenCalledTimes(1)
  })

  it('throws and logs nothing when the merge did not land', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(toggleSpotlightEnabled(PID, true)).rejects.toThrow('boom')
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })
})

describe('resetSpotlightToDefault', () => {
  it('merges the calmed spotlight key, then clears profile_theme in a second checked update', async () => {
    await resetSpotlightToDefault(PID)
    expect(patch().p_patch).toEqual({ spotlight: { enabled: true, published: false, layout: null, background: null } })
    expect(mocks.updates).toEqual([{ profile_theme: null }])
    expect(mocks.logAdminAction).toHaveBeenCalledTimes(1)
  })

  it('does not touch profile_theme or the audit log when the merge did not land', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(resetSpotlightToDefault(PID)).rejects.toThrow('boom')
    expect(mocks.updates).toEqual([])
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })

  it('surfaces a failed profile_theme update', async () => {
    mocks.updateError = { message: 'theme refused' }
    await expect(resetSpotlightToDefault(PID)).rejects.toThrow('theme refused')
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })
})

describe('forceUnpublishSpotlight', () => {
  it('merges only the spotlight key with published:false', async () => {
    await forceUnpublishSpotlight(PID)
    expect(mocks.updates).toEqual([])
    expect(patch().p_patch).toEqual({ spotlight: { enabled: true, published: false, layout: { rows: [] } } })
  })
})
