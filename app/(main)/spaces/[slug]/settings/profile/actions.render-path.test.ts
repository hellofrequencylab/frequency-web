import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { upgradeLayout } from '@/lib/entity-blocks/node-tree'
import { NODE_LAYOUT_WRITE_ERROR } from '@/lib/entity-blocks/legacy-write-guard'

const state = vi.hoisted(() => ({ on: true, preferences: {} as Record<string, unknown>, writes: [] as Array<{ preferences: Record<string, unknown> }> }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'owner' }) }))
vi.mock('@/lib/spaces/store', () => ({
  getSpaceById: async () => ({ id: 'space', slug: 'calm', preferences: state.preferences }),
  getVisibleSpaceBySlug: async () => ({ id: 'space', slug: 'calm', preferences: state.preferences }),
}))
vi.mock('@/lib/spaces/entitlements', () => ({ resolveSpaceManageAccess: async () => ({ canManage: true }) }))
vi.mock('@/lib/sites/site-cache', () => ({ refreshSite: vi.fn() }))
vi.mock('@/lib/importer/store', () => ({ getIntakeBySpaceId: vi.fn() }))
vi.mock('@/lib/importer/compose', () => ({ reseedBlockCopy: vi.fn() }))
vi.mock('@/lib/platform-flags', () => ({ renderPathEnabled: async () => state.on }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ update: (value: { preferences: Record<string, unknown> }) => { state.writes.push(value); return { eq: async () => ({ error: null }) } } }) }),
}))
import { saveSpaceGridLayout, publishSpaceProfileLayout, discardSpaceProfileDraft } from './actions'

type LayoutArg = Parameters<typeof saveSpaceGridLayout>[1]
const legacy = { rows: [{ id: 'r0', columns: 1, cells: [['text']] }], content: { text: { text: 'Authored copy' } } }
const native = upgradeLayout(JSON.parse(readFileSync('scripts/fixtures/node-document-safety/unknown-nested.json', 'utf8')))!

beforeEach(() => { state.on = true; state.preferences = { accent: 'sky', profileLayout: legacy }; state.writes = [] })

describe('Space native writer behind render_path_space_profile', () => {
  it('switched on, stores an incoming node document as nodes, keeping unknown types and the other keys', async () => {
    expect(await saveSpaceGridLayout('calm', native as unknown as LayoutArg)).toEqual({})
    const saved = state.writes[0].preferences
    expect(saved.accent).toBe('sky')
    expect(saved.profileLayout).toEqual(legacy)
    const draft = saved.profileLayoutDraft as { rows: unknown[]; bench: unknown[] }
    expect(Array.isArray(draft.bench)).toBe(true)
    expect(JSON.stringify(draft)).toContain(JSON.stringify(native.rows[0].cells[0][0].nid))
  })
  it('switched off, the same node document is refused and nothing is written', async () => {
    state.on = false
    expect(await saveSpaceGridLayout('calm', native as unknown as LayoutArg)).toEqual({ error: NODE_LAYOUT_WRITE_ERROR })
    expect(state.writes).toEqual([])
  })
  it('switched on, a stale legacy save over stored nodes is still refused', async () => {
    state.preferences = { profileLayoutDraft: native }
    expect(await saveSpaceGridLayout('calm', legacy as unknown as LayoutArg)).toEqual({ error: NODE_LAYOUT_WRITE_ERROR })
    expect(state.writes).toEqual([])
  })
  it('switched on, publish and discard work over stored nodes; off, they are refused', async () => {
    state.preferences = { profileLayoutDraft: native }
    expect(await publishSpaceProfileLayout('calm')).toEqual({})
    expect(state.writes[0].preferences.profileLayout).toEqual(native)
    state.writes = []
    state.preferences = { profileLayoutDraft: native }
    expect(await discardSpaceProfileDraft('calm')).toEqual({})
    state.on = false
    state.preferences = { profileLayoutDraft: native }
    expect(await publishSpaceProfileLayout('calm')).toEqual({ error: NODE_LAYOUT_WRITE_ERROR })
  })
})
