import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ caps: vi.fn(), profile: vi.fn(), tables: [] as string[], filters: [] as unknown[][], parent: null as Record<string, unknown> | null, spaceId: 'private-space' as string | null, error: null as unknown }))
vi.mock('react', () => ({ cache: (fn: unknown) => fn }))
vi.mock('@/lib/spaces/entitlements', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/spaces/entitlements')>(), getSpaceCapabilities: fixture.caps }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: fixture.profile, isPlatformStaff: async () => false }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  fixture.tables.push(table)
  const query = { select: () => query, eq: (key: string, value: unknown) => { fixture.filters.push([table, key, value]); return query }, neq: (key: string, value: unknown) => { fixture.filters.push([table, key, value]); return query }, maybeSingle: async () => table === 'spaces' ? { data: fixture.parent, error: fixture.error } : { data: { id: 'circle', space_id: fixture.spaceId, access: 'open', host: null } }, order: async () => ({ data: [{ profile: { display_name: 'Hidden Member' } }] }) }
  return query
} }) }))
import { loadCircleShell } from './store'
beforeEach(() => {
  fixture.tables.length = 0
  fixture.filters.length = 0
  fixture.error = null
  fixture.spaceId = 'private-space'
  fixture.parent = { id: 'private-space', owner_profile_id: 'owner', visibility: 'private', status: 'active', entitlements: {} }
  fixture.caps.mockReset().mockResolvedValue({ role: null, canEditProfile: false })
  fixture.profile.mockReset().mockResolvedValue('outsider')
})
it('an open Circle in a private parent never reads or returns its roster to outsiders', async () => {
  expect(await loadCircleShell('secret')).toBeNull()
  expect(fixture.caps).toHaveBeenCalledWith({ id: 'private-space', ownerProfileId: 'owner', entitlements: {} }, 'outsider')
  expect(fixture.tables).toEqual(['circles', 'spaces'])
  expect(fixture.filters).toContainEqual(['spaces', 'id', 'private-space'])
})
it('an enabled public parent retains the roster without a capability lookup', async () => {
  fixture.parent!.visibility = 'network'
  const shell = await loadCircleShell('public')
  expect(shell?.canEnter).toBe(true)
  expect(shell?.members[0].profile?.display_name).toBe('Hidden Member')
  expect(fixture.tables).toEqual(['circles', 'spaces', 'memberships'])
  expect(fixture.caps).not.toHaveBeenCalled()
})
it.each(['viewer', 'editor', 'admin'])('uses fresh canonical %s capability results for private enabled parents', async role => {
  fixture.profile.mockResolvedValue('current-viewer')
  fixture.caps.mockResolvedValue({ role, canEditProfile: role !== 'viewer' })
  expect((await loadCircleShell('private'))?.canEnter).toBe(true)
  expect(fixture.caps.mock.calls[0][1]).toBe('current-viewer')
})
it('denies disabled modules to viewers and retains writer stewardship', async () => {
  fixture.parent!.entitlements = { circles: false }
  fixture.caps.mockResolvedValue({ role: 'viewer', canEditProfile: false })
  expect(await loadCircleShell('disabled')).toBeNull()
  expect(fixture.tables).not.toContain('memberships')
  fixture.caps.mockResolvedValue({ role: 'editor', canEditProfile: true })
  expect((await loadCircleShell('disabled'))?.canEnter).toBe(true)
})
it.each(['missing', 'error'])('fails closed on %s parent metadata rather than treating it as legacy', async failure => {
  if (failure === 'missing') fixture.parent = null
  else fixture.error = { message: 'lookup failed' }
  expect(await loadCircleShell('missing')).toBeNull()
  expect(fixture.tables).not.toContain('memberships')
})
it('keeps genuinely unpartitioned legacy Circles accessible without a parent read', async () => {
  fixture.spaceId = null
  fixture.parent = null
  expect((await loadCircleShell('legacy'))?.canEnter).toBe(true)
  expect(fixture.tables).toEqual(['circles', 'memberships'])
})
