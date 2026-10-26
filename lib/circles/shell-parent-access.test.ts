import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ allowed: vi.fn(), tables: [] as string[] }))
vi.mock('react', () => ({ cache: (fn: unknown) => fn }))
vi.mock('./parent-access', () => ({ canReadCircleParentSpace: fixture.allowed }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'outsider', isPlatformStaff: async () => false }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  fixture.tables.push(table)
  const query = { select: () => query, eq: () => query, neq: () => query, maybeSingle: async () => ({ data: { id: 'circle', space_id: 'private-space', access: 'open', host: null } }), order: async () => ({ data: [{ profile: { display_name: 'Hidden Member' } }] }) }
  return query
} }) }))
import { loadCircleShell } from './store'
beforeEach(() => { fixture.tables.length = 0; fixture.allowed.mockReset() })
it('an open Circle in an inaccessible parent never reads or returns its roster', async () => {
  fixture.allowed.mockResolvedValue(false)
  expect(await loadCircleShell('secret')).toBeNull()
  expect(fixture.allowed).toHaveBeenCalledWith('private-space', 'outsider')
  expect(fixture.tables).toEqual(['circles'])
})
it('an accessible parent retains the open Circle roster contract', async () => {
  fixture.allowed.mockResolvedValue(true)
  const shell = await loadCircleShell('public')
  expect(shell?.canEnter).toBe(true)
  expect(shell?.members[0].profile?.display_name).toBe('Hidden Member')
  expect(fixture.tables).toEqual(['circles', 'memberships'])
})
