import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { upgradeLayout } from '@/lib/entity-blocks/node-tree'
import { parseEntityLayout } from '@/lib/entity-blocks/layout'
import { NODE_LAYOUT_WRITE_ERROR } from '@/lib/entity-blocks/legacy-write-guard'
const state = vi.hoisted(() => ({ allowed: true, preferences: {} as Record<string, unknown>, writes: [] as unknown[] }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'owner' }) }))
vi.mock('@/lib/spaces/store', () => ({
  getSpaceById: async () => ({ id: 'space', slug: 'calm', preferences: state.preferences }),
  getVisibleSpaceBySlug: async () => ({ id: 'space', slug: 'calm', preferences: state.preferences }),
}))
vi.mock('@/lib/spaces/entitlements', () => ({ resolveSpaceManageAccess: async () => ({ canManage: state.allowed }) }))
vi.mock('@/lib/sites/site-cache', () => ({ refreshSite: vi.fn() }))
vi.mock('@/lib/importer/store', () => ({ getIntakeBySpaceId: vi.fn() }))
vi.mock('@/lib/importer/compose', () => ({ reseedBlockCopy: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ update: (value: unknown) => { state.writes.push(value); return { eq: async () => ({ error: null }) } } }) }) }))
import { saveSpaceGridLayout, publishSpaceProfileLayout, discardSpaceProfileDraft } from './actions'
type LayoutArg = Parameters<typeof saveSpaceGridLayout>[1]
const legacy = { rows: [{ id: 'r0', columns: 1, cells: [['text']] }], content: { text: { text: 'Authored copy' } } }
const adversarial = JSON.parse(readFileSync('scripts/fixtures/node-document-safety/unknown-nested.json', 'utf8'))
const native = upgradeLayout(adversarial)!
beforeEach(() => { state.allowed = true; state.preferences = { accent: 'sky', profileLayout: legacy }; state.writes = [] })

describe('Space writer rejects incompatible native storage before destructive downgrade', () => {
  it('refuses inline native nodes, mixed cells, empty stored bench and authored bench-only payloads', async () => {
    for (const payload of [native, { rows: [{ id: 'r0', columns: 1, cells: [['text', native.rows[0].cells[0][0]]] }] }, { rows: [], bench: [] }, { rows: [], bench: native.bench }, { rows: [], bench: 'malformed' }]) {
      const before = JSON.stringify(state.preferences)
      expect(await saveSpaceGridLayout('calm', payload as unknown as LayoutArg)).toEqual({ error: NODE_LAYOUT_WRITE_ERROR })
      expect(state.writes).toEqual([])
      expect(JSON.stringify(state.preferences)).toBe(before)
    }
  })
  it('refuses stale legacy saves and explicit clears over native published or draft work', async () => {
    for (const key of ['profileLayout', 'profileLayoutDraft']) {
      state.preferences = { accent: 'sky', [key]: native }
      const before = JSON.stringify(state.preferences)
      for (const payload of [legacy, { rows: [], hidden: [] }]) expect(await saveSpaceGridLayout('calm', payload as unknown as LayoutArg)).toEqual({ error: NODE_LAYOUT_WRITE_ERROR })
      expect(state.writes).toEqual([])
      expect(JSON.stringify(state.preferences)).toBe(before)
    }
  })
  it('cannot promote, auto-clear or blindly discard unsupported native authored work', async () => {
    for (const key of ['profileLayout', 'profileLayoutDraft']) {
      state.preferences = { accent: 'sky', profileLayoutDraft: legacy, [key]: native }
      const before = JSON.stringify(state.preferences)
      expect(await publishSpaceProfileLayout('calm')).toEqual({ error: NODE_LAYOUT_WRITE_ERROR })
      expect(await discardSpaceProfileDraft('calm')).toEqual({ error: NODE_LAYOUT_WRITE_ERROR })
      expect(state.writes).toEqual([])
      expect(JSON.stringify(state.preferences)).toBe(before)
    }
  })
  it('accepts the existing legacy read projection and retains independent preference keys', async () => {
    const projected = parseEntityLayout(legacy)!
    expect(projected.nodes).toBeTruthy()
    expect(await saveSpaceGridLayout('calm', projected as unknown as LayoutArg)).toEqual({})
    const stored = state.writes[0] as { preferences: Record<string, unknown> }
    expect(stored.preferences.accent).toBe('sky')
    expect(stored.preferences.profileLayout).toEqual(legacy)
    expect(stored.preferences.profileLayoutDraft).toBeUndefined() // same-render draft clears normally
  })
  it('keeps the authorization refusal ahead of layout-format disclosure', async () => {
    state.allowed = false
    expect(await saveSpaceGridLayout('calm', native as unknown as LayoutArg)).toEqual({ error: 'You do not have permission to edit this space.' })
    expect(state.writes).toEqual([])
  })
})
