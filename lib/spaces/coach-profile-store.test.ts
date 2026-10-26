import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptySpaceCoachProfile } from './coach-profile'
const m = vi.hoisted(() => ({ from: vi.fn(), warn: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: m.from }) }))
vi.mock('@/lib/log', () => ({ log: { warn: m.warn } }))
import { loadSpaceCoachProfile, writeSpaceCoachProfile } from './private-state'
const rows = new Map<string, Record<string, unknown>>()
let missingColumn = false
beforeEach(() => {
  rows.clear(); missingColumn = false; vi.clearAllMocks()
  m.from.mockImplementation((table: string) => {
    expect(table).toBe('space_private_state')
    return {
      select: (column: string) => { expect(column).toBe('coach_profile'); return { eq: (key: string, id: string) => { expect(key).toBe('space_id'); return { maybeSingle: async () => ({ data: rows.get(id), error: missingColumn ? { code: '42703' } : null }) } } } },
      upsert: async (value: Record<string, unknown>, options: { onConflict: string }) => {
        expect(options.onConflict).toBe('space_id')
        expect(Object.keys(value).sort()).toEqual(['coach_profile', 'space_id', 'updated_at'])
        if (missingColumn) return { error: { code: '42703' } }
        rows.set(String(value.space_id), { ...rows.get(String(value.space_id)), ...value })
        return { error: null }
      },
    }
  })
})
describe('private Space coach storage contract (mocked database)', () => {
  it('isolates two tenants and preserves editor/overview state on save and clear', async () => {
    rows.set('A', { website_editor: { draft: 'keep' }, program_overview: 'keep overview' })
    await writeSpaceCoachProfile('A', { ...emptySpaceCoachProfile(), goals: 'A goals' })
    await writeSpaceCoachProfile('B', { ...emptySpaceCoachProfile(), goals: 'B goals' })
    expect(await loadSpaceCoachProfile('A')).toEqual({ available: true, profile: { ...emptySpaceCoachProfile(), goals: 'A goals' } })
    await writeSpaceCoachProfile('A', null)
    expect((await loadSpaceCoachProfile('B'))).toHaveProperty('profile.goals', 'B goals')
    expect(rows.get('A')).toHaveProperty('website_editor.draft', 'keep')
    expect(rows.get('A')?.program_overview).toBe('keep overview')
    expect(await loadSpaceCoachProfile('A')).toEqual({ available: true, profile: emptySpaceCoachProfile() })
  })
  it('fails closed and logs unavailable storage without leaking note contents', async () => {
    missingColumn = true
    expect(await loadSpaceCoachProfile('A')).toEqual({ available: false })
    expect(await writeSpaceCoachProfile('A', { ...emptySpaceCoachProfile(), goals: 'Secret notes' })).toBe(false)
    expect(rows.size).toBe(0)
    expect(m.warn).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(m.warn.mock.calls)).not.toContain('Secret notes')
  })
})
