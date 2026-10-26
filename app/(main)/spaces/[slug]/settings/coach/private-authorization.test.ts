import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptySpaceCoachProfile } from '@/lib/spaces/coach-profile'
const m = vi.hoisted(() => ({ actor: 'staff', staff: true, network: false, role: null as string | null, status: 'active', reads: [] as Record<string, string>[], writes: [] as Record<string, unknown>[], fail: false, rows: new Map<string, Record<string, unknown>>() }))
vi.mock('server-only', () => ({}))
// Render caches deliberately retain a membership. Private writes must use the uncached reader.
vi.mock('react', () => ({ cache: (fn: (...args: string[]) => unknown) => { const cache = new Map(); return (...args: string[]) => { const key = JSON.stringify(args); if (!cache.has(key)) cache.set(key, fn(...args)); return cache.get(key) } } }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => m.actor || null, isPlatformStaff: async () => m.staff }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: async (id: string) => ({ id, slug: id, ownerProfileId: `owner-${id}` }) }))
vi.mock('@/lib/collective/network-tools-store', () => ({ networkCentralAdminReach: async () => m.network }))
vi.mock('@/lib/log', () => ({ log: { warn: vi.fn() } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  const filters: Record<string, string> = {}
  const query = {
    select: () => query,
    eq: (key: string, value: string) => { filters[key] = value; return query },
    maybeSingle: async () => {
      expect(table).toBe('space_members'); m.reads.push({ ...filters })
      return { error: m.fail ? { message: 'unavailable' } : null, data: !m.fail && m.role && filters.space_id === 'space-A' ? { id: 'membership', space_id: filters.space_id, profile_id: filters.profile_id, role: m.role, status: m.status, invited_by: null, created_at: '2026-10-01T00:00:00Z' } : null }
    },
    upsert: async (payload: Record<string, unknown>, options: unknown) => {
      expect(table).toBe('space_private_state'); expect(options).toEqual({ onConflict: 'space_id' })
      m.writes.push(payload); const id = String(payload.space_id)
      m.rows.set(id, { ...m.rows.get(id), ...payload }); return { error: null }
    },
  }
  return query
} }) }))
import { saveSpaceCoachProfile } from './actions'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { getSpaceMembership } from '@/lib/spaces/membership'
const profile = { ...emptySpaceCoachProfile(), voice: 'Owner-authored private voice' }
beforeEach(() => {
  m.actor = 'staff'; m.staff = true; m.network = false; m.role = null; m.status = 'active'; m.fail = false; m.reads = []; m.writes = []
  m.rows = new Map(['space-A', 'space-B'].map(id => [id, { coach_profile: { ...profile, goals: id }, website_editor: { draft: id }, program_overview: `private-${id}` }]))
})
describe('private coach writes use actual direct-editor authority, not general content authority', () => {
  it.each([false, true])('denies staff/network save and clear even when real general capabilities allow edits (network=%s)', async network => {
    m.actor = network ? 'network-admin' : 'staff'; m.network = network; m.staff = !network
    expect((await getSpaceCapabilities({ id: 'space-A', ownerProfileId: 'owner-space-A' }, m.actor)).canEditProfile).toBe(true)
    const before = structuredClone([...m.rows])
    expect(await saveSpaceCoachProfile('space-A', profile)).toHaveProperty('error')
    expect(await saveSpaceCoachProfile('space-A', null)).toHaveProperty('error')
    expect(m.writes).toHaveLength(0); expect([...m.rows]).toEqual(before)
  })
  it('allows the actual owner and touches only that tenant coach column', async () => {
    m.actor = 'owner-space-A'
    expect(await saveSpaceCoachProfile('space-A', profile)).toEqual({ data: profile })
    expect(m.rows.get('space-A')).toMatchObject({ coach_profile: profile, website_editor: { draft: 'space-A' }, program_overview: 'private-space-A' })
    expect(m.rows.get('space-B')?.coach_profile).toMatchObject({ goals: 'space-B' })
    expect(Object.keys(m.writes[0]).sort()).toEqual(['coach_profile', 'space_id', 'updated_at'])
  })
  it('allows an active direct editor, but not the same editor on a different tenant', async () => {
    m.actor = 'direct-editor'; m.role = 'editor'
    expect(await saveSpaceCoachProfile('space-A', null)).toEqual({ data: emptySpaceCoachProfile() })
    expect(await saveSpaceCoachProfile('space-B', profile)).toHaveProperty('error')
    expect(m.writes).toHaveLength(1); expect(m.writes[0].space_id).toBe('space-A')
  })
  it('rejects revoked membership even after a cached grant, then rejects database failures', async () => {
    m.actor = 'revoked-editor'; m.staff = false; m.role = 'editor'
    expect((await getSpaceMembership('space-A', m.actor))?.status).toBe('active')
    m.status = 'suspended'
    expect((await getSpaceMembership('space-A', m.actor))?.status).toBe('active')
    expect(await saveSpaceCoachProfile('space-A', profile)).toHaveProperty('error')
    m.status = 'active'; m.fail = true
    expect(await saveSpaceCoachProfile('space-A', null)).toHaveProperty('error')
    expect(m.writes).toHaveLength(0)
  })
  it('rejects an anonymous actor before any membership or private storage IO', async () => {
    m.actor = ''
    expect(await saveSpaceCoachProfile('space-A', profile)).toHaveProperty('error')
    expect(m.reads).toHaveLength(0); expect(m.writes).toHaveLength(0)
  })
})
