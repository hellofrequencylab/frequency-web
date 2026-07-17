import { describe, it, expect, beforeEach, vi } from 'vitest'

// PER-SPACE PIPELINE STAGES (ADR-517 Phase F2). This locks BOTH the pure invariants that guard every
// write (name normalization, the Won/Lost floor, the reassign-target pick, the reorder permutation) AND
// the owner gate + space-scoping of the actions themselves: a non-manager writes nothing, every write is
// stamped/filtered by space_id, the last Won / last Lost cannot be dropped, and deleting a stage with
// deals reassigns them to an adjacent open stage first. The Supabase/auth/store seams are stubbed with a
// recording admin client, so we can assert exactly which rows were written + how they were scoped.

const h = vi.hoisted(() => {
  const state = {
    ops: [] as unknown[][],
    stagesInsert: { data: { id: 'new-stage' } as { id: string } | null, error: null as unknown },
    stagesUpdate: { error: null as unknown },
    stagesDelete: { error: null as unknown },
    dealsUpdate: { error: null as unknown },
    dealsCount: 0,
  }
  function chain(result: unknown) {
    const c: Record<string, unknown> = {
      eq: (col: string, val: string) => {
        state.ops.push(['eq', col, val])
        return c
      },
      select: () => c,
      maybeSingle: async () => result,
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(res, rej),
    }
    return c
  }
  const admin = {
    from: (table: string) => {
      if (table === 'crm_stages') {
        return {
          insert: (row: unknown) => {
            state.ops.push(['stages.insert', row])
            return chain(state.stagesInsert)
          },
          update: (row: unknown) => {
            state.ops.push(['stages.update', row])
            return chain(state.stagesUpdate)
          },
          delete: () => {
            state.ops.push(['stages.delete'])
            return chain(state.stagesDelete)
          },
        }
      }
      if (table === 'crm_deals') {
        return {
          update: (row: unknown) => {
            state.ops.push(['deals.update', row])
            return chain(state.dealsUpdate)
          },
          select: (col: string, opts: unknown) => {
            state.ops.push(['deals.select', col, opts])
            return chain({ count: state.dealsCount })
          },
        }
      }
      return {}
    },
  }
  return { state, admin }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: vi.fn() }))
vi.mock('@/lib/spaces/store', () => ({ getVisibleSpaceBySlug: vi.fn() }))
vi.mock('@/lib/spaces/entitlements', () => ({
  resolveSpaceManageAccess: vi.fn(),
  getSpaceCapabilities: vi.fn(),
}))
vi.mock('@/lib/spaces/functions', () => ({ spaceFunctionAccess: vi.fn() }))
vi.mock('@/lib/crm/pipeline', () => ({ getStages: vi.fn() }))

import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { getStages } from '@/lib/crm/pipeline'
import {
  normalizeStageName,
  isStageKind,
  countKind,
  canDeleteStage,
  canSetStageKind,
  pickReassignStage,
  isValidReorder,
  resolveStageManagerAccess,
  createStage,
  renameStage,
  setStageKind,
  reorderStages,
  deleteStage,
} from './stages'

const S = (id: string, kind: 'open' | 'won' | 'lost', sort_order: number) => ({
  id,
  name: id,
  kind,
  sort_order,
})

/** The default three-kind pipeline for the action tests (one open, one won, one lost). */
function seedStages() {
  vi.mocked(getStages).mockResolvedValue([S('o', 'open', 0), S('w', 'won', 1), S('l', 'lost', 2)])
}

beforeEach(() => {
  vi.clearAllMocks()
  h.state.ops = []
  h.state.stagesInsert = { data: { id: 'new-stage' }, error: null }
  h.state.stagesUpdate = { error: null }
  h.state.stagesDelete = { error: null }
  h.state.dealsUpdate = { error: null }
  h.state.dealsCount = 0
  // Happy-path manager gate by default; individual tests override.
  vi.mocked(getCallerProfile).mockResolvedValue({ id: 'me', webRole: 'member' } as never)
  vi.mocked(getVisibleSpaceBySlug).mockResolvedValue({ id: 'space-1', slug: 'demo' } as never)
  vi.mocked(resolveSpaceManageAccess).mockResolvedValue({ canManage: true, staffViewing: false })
  vi.mocked(getSpaceCapabilities).mockResolvedValue({ role: 'admin' } as never)
  vi.mocked(spaceFunctionAccess).mockReturnValue(true)
})

// ── Pure helpers ───────────────────────────────────────────────────────────────────────────────────

describe('normalizeStageName', () => {
  it('trims + collapses whitespace and caps length', () => {
    expect(normalizeStageName('  New   lead  ')).toBe('New lead')
    expect(normalizeStageName('x'.repeat(200)).length).toBe(60)
  })
  it('returns "" for non-strings / blank (the reject signal)', () => {
    expect(normalizeStageName(undefined)).toBe('')
    expect(normalizeStageName(42)).toBe('')
    expect(normalizeStageName('   ')).toBe('')
  })
})

describe('isStageKind', () => {
  it('accepts only open / won / lost', () => {
    expect(isStageKind('open')).toBe(true)
    expect(isStageKind('won')).toBe(true)
    expect(isStageKind('lost')).toBe(true)
    expect(isStageKind('nope')).toBe(false)
    expect(isStageKind(null)).toBe(false)
  })
})

describe('the Won/Lost invariant (pure)', () => {
  const stages = [S('o', 'open', 0), S('w', 'won', 1), S('l', 'lost', 2)]
  it('counts each kind', () => {
    expect(countKind(stages, 'won')).toBe(1)
    expect(countKind(stages, 'open')).toBe(1)
  })
  it('blocks deleting the last Won or last Lost, allows deleting an open', () => {
    expect(canDeleteStage(stages, 'w').ok).toBe(false)
    expect(canDeleteStage(stages, 'l').ok).toBe(false)
    expect(canDeleteStage(stages, 'o').ok).toBe(true)
  })
  it('allows deleting a Won when another Won remains', () => {
    const two = [...stages, S('w2', 'won', 3)]
    expect(canDeleteStage(two, 'w').ok).toBe(true)
  })
  it('blocks a kind-change that would drop the last Won / Lost', () => {
    expect(canSetStageKind(stages, 'w', 'open').ok).toBe(false)
    expect(canSetStageKind(stages, 'l', 'open').ok).toBe(false)
    expect(canSetStageKind(stages, 'o', 'won').ok).toBe(true)
    // A no-op (same kind) is always fine.
    expect(canSetStageKind(stages, 'w', 'won').ok).toBe(true)
  })
})

describe('pickReassignStage (never orphan a deal)', () => {
  const stages = [S('o1', 'open', 0), S('o2', 'open', 1), S('w', 'won', 2), S('l', 'lost', 3)]
  it('picks the nearest remaining open stage, preferring the preceding one', () => {
    expect(pickReassignStage(stages, 'o2')).toBe('o1') // preceding open wins
    expect(pickReassignStage(stages, 'o1')).toBe('o2') // next open when none precedes
  })
  it('returns null when no open stage would remain', () => {
    const noOpenLeft = [S('o', 'open', 0), S('w', 'won', 1), S('l', 'lost', 2)]
    expect(pickReassignStage(noOpenLeft, 'o')).toBeNull()
  })
})

describe('isValidReorder', () => {
  it('accepts a permutation and rejects add / drop / dupe', () => {
    expect(isValidReorder(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true)
    expect(isValidReorder(['a', 'b', 'c'], ['a', 'b'])).toBe(false)
    expect(isValidReorder(['a', 'b', 'c'], ['a', 'b', 'x'])).toBe(false)
    expect(isValidReorder(['a', 'b', 'c'], ['a', 'b', 'b'])).toBe(false)
  })
})

// ── The owner gate (shared by the writes AND the rail Pipeline getter) ───────────────────────────────

describe('resolveStageManagerAccess (the shared gate)', () => {
  it('returns the space id + slug for a manager who can use crm', async () => {
    expect(await resolveStageManagerAccess('demo')).toEqual({ spaceId: 'space-1', slug: 'demo' })
  })
  it('returns null for a non-manager (canManage false) — the getter shows nothing', async () => {
    vi.mocked(resolveSpaceManageAccess).mockResolvedValue({ canManage: false, staffViewing: true })
    expect(await resolveStageManagerAccess('demo')).toBeNull()
  })
  it('returns null when the space is not visible', async () => {
    vi.mocked(getVisibleSpaceBySlug).mockResolvedValue(null)
    expect(await resolveStageManagerAccess('demo')).toBeNull()
  })
  it('returns null when the crm function is denied', async () => {
    vi.mocked(spaceFunctionAccess).mockReturnValue(false)
    expect(await resolveStageManagerAccess('demo')).toBeNull()
  })
})

// ── createStage ──────────────────────────────────────────────────────────────────────────────────────

describe('createStage', () => {
  it('inserts a space-scoped stage at the end and returns its id', async () => {
    seedStages()
    const res = await createStage('demo', '  New   lead ', 'open')
    expect(res).toEqual({ data: { id: 'new-stage' } })
    const insert = h.state.ops.find((o) => o[0] === 'stages.insert')!
    expect(insert[1]).toMatchObject({ space_id: 'space-1', name: 'New lead', kind: 'open', sort_order: 3 })
  })
  it('is fail-closed for a non-manager (no insert happens)', async () => {
    vi.mocked(resolveSpaceManageAccess).mockResolvedValue({ canManage: false, staffViewing: false })
    const res = await createStage('demo', 'New', 'open')
    expect('error' in res).toBe(true)
    expect(h.state.ops.some((o) => o[0] === 'stages.insert')).toBe(false)
  })
  it('rejects an empty name', async () => {
    const res = await createStage('demo', '   ', 'open')
    expect('error' in res).toBe(true)
    expect(h.state.ops.some((o) => o[0] === 'stages.insert')).toBe(false)
  })
})

// ── renameStage ──────────────────────────────────────────────────────────────────────────────────────

describe('renameStage', () => {
  it('updates the name filtered by BOTH id and space_id', async () => {
    const res = await renameStage('demo', 'o', '  Renamed ')
    expect('data' in res).toBe(true)
    expect(h.state.ops.find((o) => o[0] === 'stages.update')![1]).toEqual({ name: 'Renamed' })
    expect(h.state.ops).toContainEqual(['eq', 'id', 'o'])
    expect(h.state.ops).toContainEqual(['eq', 'space_id', 'space-1'])
  })
  it('is fail-closed for a non-manager', async () => {
    vi.mocked(resolveSpaceManageAccess).mockResolvedValue({ canManage: false, staffViewing: false })
    const res = await renameStage('demo', 'o', 'Renamed')
    expect('error' in res).toBe(true)
    expect(h.state.ops.some((o) => o[0] === 'stages.update')).toBe(false)
  })
})

// ── setStageKind ─────────────────────────────────────────────────────────────────────────────────────

describe('setStageKind', () => {
  it('rejects a change that would drop the last Won (no write)', async () => {
    seedStages()
    const res = await setStageKind('demo', 'w', 'open')
    expect('error' in res).toBe(true)
    expect(h.state.ops.some((o) => o[0] === 'stages.update')).toBe(false)
  })
  it('updates the kind and re-syncs the deals in that stage (space-scoped)', async () => {
    seedStages()
    const res = await setStageKind('demo', 'o', 'won')
    expect('data' in res).toBe(true)
    expect(h.state.ops.find((o) => o[0] === 'stages.update')![1]).toEqual({ kind: 'won' })
    const dealsUpdate = h.state.ops.find((o) => o[0] === 'deals.update')!
    expect(dealsUpdate[1]).toMatchObject({ status: 'won' })
    expect(h.state.ops).toContainEqual(['eq', 'space_id', 'space-1'])
  })
  it('is a no-op on an unchanged kind (Won -> Won): NO write, so closed_at is not re-stamped', async () => {
    seedStages()
    const res = await setStageKind('demo', 'w', 'won')
    expect('data' in res).toBe(true)
    // The bug: re-selecting the same kind re-ran the deal re-sync and re-stamped closed_at = now, losing
    // historical close dates + inflating upgradesThisMonth. Neither the stage nor its deals may be written.
    expect(h.state.ops.some((o) => o[0] === 'stages.update')).toBe(false)
    expect(h.state.ops.some((o) => o[0] === 'deals.update')).toBe(false)
  })
  it('compensates a TOCTOU race: reverts the stage when the write dropped the last Won to zero', async () => {
    // Guard sees TWO Won stages (change is allowed), but a concurrent write left ZERO Won by the time the
    // post-write floor check reads — so the stage (and its deals) must be reverted to keep >=1 Won/Lost.
    vi.mocked(getStages)
      .mockResolvedValueOnce([S('o', 'open', 0), S('w', 'won', 1), S('w2', 'won', 2), S('l', 'lost', 3)])
      .mockResolvedValueOnce([S('o', 'open', 0), S('l', 'lost', 3)])
    const res = await setStageKind('demo', 'w', 'open')
    expect('error' in res).toBe(true)
    const stageUpdates = h.state.ops.filter((o) => o[0] === 'stages.update').map((o) => o[1])
    // First the attempted change to open, then the compensating revert back to won.
    expect(stageUpdates).toEqual([{ kind: 'open' }, { kind: 'won' }])
  })
})

// ── reorderStages ────────────────────────────────────────────────────────────────────────────────────

describe('reorderStages', () => {
  it('writes each stage a new sort_order for a valid permutation', async () => {
    seedStages()
    const res = await reorderStages('demo', ['l', 'o', 'w'])
    expect('data' in res).toBe(true)
    const updates = h.state.ops.filter((o) => o[0] === 'stages.update').map((o) => o[1])
    expect(updates).toEqual([{ sort_order: 0 }, { sort_order: 1 }, { sort_order: 2 }])
  })
  it('rejects a non-permutation (no write)', async () => {
    seedStages()
    const res = await reorderStages('demo', ['o', 'w']) // dropped one
    expect('error' in res).toBe(true)
    expect(h.state.ops.some((o) => o[0] === 'stages.update')).toBe(false)
  })
})

// ── deleteStage ──────────────────────────────────────────────────────────────────────────────────────

describe('deleteStage', () => {
  it('rejects deleting the last Lost stage (no delete)', async () => {
    seedStages()
    const res = await deleteStage('demo', 'l')
    expect('error' in res).toBe(true)
    expect(h.state.ops.some((o) => o[0] === 'stages.delete')).toBe(false)
  })
  it('reassigns deals to an adjacent open stage before deleting', async () => {
    vi.mocked(getStages).mockResolvedValue([
      S('o1', 'open', 0),
      S('o2', 'open', 1),
      S('w', 'won', 2),
      S('l', 'lost', 3),
    ])
    h.state.dealsCount = 3
    const res = await deleteStage('demo', 'o1')
    expect('data' in res).toBe(true)
    const dealsUpdate = h.state.ops.find((o) => o[0] === 'deals.update')!
    expect(dealsUpdate[1]).toMatchObject({ stage_id: 'o2', status: 'open', closed_at: null })
    // The reassign happens BEFORE the delete.
    const moveIdx = h.state.ops.findIndex((o) => o[0] === 'deals.update')
    const delIdx = h.state.ops.findIndex((o) => o[0] === 'stages.delete')
    expect(moveIdx).toBeGreaterThanOrEqual(0)
    expect(delIdx).toBeGreaterThan(moveIdx)
  })
  it('blocks deleting an open stage with deals when no open stage would remain', async () => {
    vi.mocked(getStages).mockResolvedValue([S('o', 'open', 0), S('w', 'won', 1), S('l', 'lost', 2)])
    h.state.dealsCount = 2
    const res = await deleteStage('demo', 'o')
    expect('error' in res).toBe(true)
    expect(h.state.ops.some((o) => o[0] === 'stages.delete')).toBe(false)
  })
  it('deletes cleanly when the stage has no deals', async () => {
    seedStages()
    h.state.dealsCount = 0
    const res = await deleteStage('demo', 'o')
    expect('data' in res).toBe(true)
    expect(h.state.ops.some((o) => o[0] === 'deals.update')).toBe(false)
    expect(h.state.ops.some((o) => o[0] === 'stages.delete')).toBe(true)
  })
  it('compensates a TOCTOU race: recreates a same-kind stage when the delete dropped the last Won', async () => {
    // Guard sees TWO Won stages (delete allowed), but a concurrent write left ZERO Won by the post-delete
    // floor check — so an (empty) same-kind stage is recreated to keep >=1 Won/Lost.
    vi.mocked(getStages)
      .mockResolvedValueOnce([S('o', 'open', 0), S('w', 'won', 1), S('w2', 'won', 2), S('l', 'lost', 3)])
      .mockResolvedValueOnce([S('o', 'open', 0), S('l', 'lost', 3)])
    h.state.dealsCount = 0
    const res = await deleteStage('demo', 'w')
    expect('error' in res).toBe(true)
    const delIdx = h.state.ops.findIndex((o) => o[0] === 'stages.delete')
    const insertIdx = h.state.ops.findIndex((o) => o[0] === 'stages.insert')
    expect(delIdx).toBeGreaterThanOrEqual(0)
    // The recreate happens AFTER the delete, restoring a Won stage.
    expect(insertIdx).toBeGreaterThan(delIdx)
    expect(h.state.ops.find((o) => o[0] === 'stages.insert')![1]).toMatchObject({ kind: 'won' })
  })
})
