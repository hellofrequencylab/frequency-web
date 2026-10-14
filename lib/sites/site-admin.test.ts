import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-921: the website's admin gate agrees with the console's. The console (getSpaceCapabilities) gives
// platform staff full operator rights over any Space and mints them a full pass; if the site refused that
// pass, the person looped between the console handoff and /admin until the browser gave up.

const pass = { spaceId: 'space-1', host: 'example.com', profileId: 'p-1', staff: false }
const membership = vi.fn()
const webRole = vi.fn()

vi.mock('@/lib/sites/site-admin-pass', () => ({
  readSiteAdminPass: () => pass,
  passOpensSite: (p: typeof pass | null, host: string, spaceId: string) => !!p && p.host === host && p.spaceId === spaceId,
}))
vi.mock('@/lib/spaces/membership', async (real) => ({
  ...(await real<typeof import('@/lib/spaces/membership')>()),
  getSpaceMembership: (...a: unknown[]) => membership(...a),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { web_role: webRole() } }) }) }) }),
  }),
}))

const { siteAdminAllowed } = await import('./site-admin')
const space = { id: 'space-1', ownerProfileId: 'owner' }

describe('siteAdminAllowed', () => {
  beforeEach(() => {
    membership.mockReset().mockResolvedValue(null)
    webRole.mockReset().mockReturnValue('none')
  })

  it('lets the owner in', async () => {
    expect(await siteAdminAllowed('t', 'example.com', { ...space, ownerProfileId: 'p-1' })).toBe(true)
  })

  it('lets an active editor in and keeps a viewer out', async () => {
    membership.mockResolvedValue({ status: 'active', role: 'editor' })
    expect(await siteAdminAllowed('t', 'example.com', space)).toBe(true)
    membership.mockResolvedValue({ status: 'active', role: 'member' })
    expect(await siteAdminAllowed('t', 'example.com', space)).toBe(false)
  })

  it('lets platform staff in who are not on the team, as the console does', async () => {
    webRole.mockReturnValue('janitor')
    expect(await siteAdminAllowed('t', 'example.com', space)).toBe(true)
    webRole.mockReturnValue('admin')
    expect(await siteAdminAllowed('t', 'example.com', space)).toBe(true)
  })

  it('keeps everyone else out, and a pass for another site', async () => {
    expect(await siteAdminAllowed('t', 'example.com', space)).toBe(false)
    webRole.mockReturnValue('janitor')
    expect(await siteAdminAllowed('t', 'other.com', space)).toBe(false)
  })
})
