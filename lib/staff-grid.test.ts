import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE ROLES GRID GATES requireStaffCap (SCAN-757).
//
// staffCan reads the capability_permissions grid only when handed the overrides; requireStaffCap
// used to call it with the role alone, so a capability a janitor revoked at /admin/roles still
// opened every door behind this gate while requireAdmin honoured the same grid. A marketer whose
// marketing access is set to `none` in the grid must be redirected here.

const state = vi.hoisted(() => ({
  overrides: {} as Record<string, Record<string, string>>,
  role: 'marketer' as string | null,
}))

vi.mock('@/lib/view-as', () => ({ readViewAsTarget: async () => null }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'p1' }))
vi.mock('@/lib/permissions', () => ({ getCapabilityOverrides: async () => state.overrides }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.role ? { role: state.role } : null }) }),
      }),
    }),
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))

import { requireStaffCap, staffCanNow } from './staff'

beforeEach(() => {
  state.overrides = {}
  state.role = 'marketer'
})

describe('requireStaffCap and the capability grid', () => {
  it('admits a marketer to marketing on the code defaults', async () => {
    await expect(requireStaffCap('marketing')).resolves.toEqual({ profileId: 'p1', role: 'marketer' })
  })

  it('redirects a marketer whose marketing access the grid set to none', async () => {
    state.overrides = { marketer: { marketing: 'none' } }
    await expect(requireStaffCap('marketing')).rejects.toThrow('REDIRECT:/')
  })

  it('staffCanNow answers the same question without redirecting', async () => {
    expect(await staffCanNow('marketing')).toEqual({ profileId: 'p1', role: 'marketer' })
    state.overrides = { marketer: { marketing: 'none' } }
    expect(await staffCanNow('marketing')).toBeNull()
  })
})
