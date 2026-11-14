import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const io = vi.hoisted(() => ({ row: { id: 'draft', step_reached: 3, tz: 'America/Los_Angeles' } as Record<string, unknown>, patches: [] as Record<string, unknown>[] }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: io.row, error: null }) }) }),
  update: (patch: Record<string, unknown>) => ({ eq: async () => { io.patches.push(patch); Object.assign(io.row, patch); return { error: null } } }),
}) }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: async () => ({ data: null, error: null }) }) }))
vi.mock('@/lib/attribution/server', () => ({ resolveAcquisition: async () => ({}) }))
vi.mock('@/lib/spaces/store', () => ({ isSpaceSlugTaken: async () => false }))
import { emptyDraft } from './builder'
import { saveDraft } from './draft-io'
beforeEach(() => { io.row = { id: 'draft', step_reached: 3, tz: 'America/Los_Angeles' }; io.patches.length = 0 })
describe('latest draft snapshot timezone', () => {
  for (const tz of [null, 'not a valid timezone', 'America/Unknown_Place']) it(`preserves the stored timezone when the new zone is ${tz}`, async () => {
    await saveDraft({ draft: { ...emptyDraft('new-world', true), name: 'My Space', email: 'owner@example.com' }, token: 'known-token-12345678', tz, ownPhoto: false })
    expect(io.row.tz).toBe('America/Los_Angeles')
    expect(io.patches[0]).not.toHaveProperty('tz')
  })
  it('updates a known timezone when the caller supplies another validated zone', async () => {
    await saveDraft({ draft: { ...emptyDraft('new-world', true), name: 'My Space', email: 'owner@example.com' }, token: 'known-token-12345678', tz: 'Europe/Lisbon', ownPhoto: false })
    expect(io.row.tz).toBe('Europe/Lisbon')
  })
})
