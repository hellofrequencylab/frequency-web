import { describe, it, expect, beforeEach, vi } from 'vitest'

// SEGMENT BUILDER ACTIONS (ADR-069 Phase 3 → P5). The mutation seam the composer calls. What
// is locked here, all network-free (the admin guard + the segments DB layer are mocked; the
// pure registry validator runs FOR REAL so a bad definition is genuinely caught against the
// trait registry):
//   1. AUTHZ: every action runs the write-level gate (janitor OR the `insights` staff domain)
//      BEFORE any write; a denied gate throws and nothing is persisted.
//   2. VALIDATION: a blank name and a definition that fails the registry validator are both
//      refused with a friendly error, and no row is written.
//   3. PERSIST: a valid create stamps the gated caller as created_by and revalidates the index;
//      a valid update re-reads the row, refuses a built-in (is_system) segment, and writes.
//
// The gate is the central authorization point: the admin client bypasses RLS, so the action
// re-runs the same staff check the index page reads, raised to write (see actions.ts header).

// ── Spies are created via vi.hoisted so they exist when the hoisted vi.mock factories run
//    (a plain `const` declared below would crash with "cannot access before initialization"). ──
const { requireAdmin, revalidatePath, createSegmentRow, updateSegmentRow, deleteSegmentRow, previewSegmentCount, getSegment } =
  vi.hoisted(() => ({
    requireAdmin: vi.fn(),
    revalidatePath: vi.fn(),
    createSegmentRow: vi.fn(),
    updateSegmentRow: vi.fn(),
    deleteSegmentRow: vi.fn(),
    previewSegmentCount: vi.fn(),
    getSegment: vi.fn(),
  }))

// Mutable scenario state the mock implementations read (configured in beforeEach).
let gateProfileId: string | null = 'staff-0000-4000-a000-00000000insi'
let storedSegment: { id: string; slug: string; name: string; description: string | null; is_system: boolean; definition: unknown } | null = null

vi.mock('@/lib/admin/guard', () => ({ requireAdmin }))
vi.mock('next/cache', () => ({ revalidatePath }))
// Mock ONLY the DB-touching helpers; keep the real, registry-backed validateSegmentDefinition.
vi.mock('@/lib/traits/segments', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/traits/segments')>()
  return {
    ...actual,
    createSegment: createSegmentRow,
    updateSegment: updateSegmentRow,
    deleteSegment: deleteSegmentRow,
    previewSegmentCount,
    getSegment,
  }
})

import { createSegment, updateSegment, deleteSegment, previewSegment } from './actions'
import type { SegmentDefinition } from '@/lib/traits/segments'

// A definition that is VALID against the real registry (web_beta is a registered tag).
const validDef: SegmentDefinition = { combinator: 'all', predicates: [{ type: 'tag', key: 'web_beta' }] }
// Registry-INVALID: "not_a_tag" is not a registered tag, so the real validator rejects it.
const invalidDef: SegmentDefinition = { combinator: 'all', predicates: [{ type: 'tag', key: 'not_a_tag' }] }

beforeEach(() => {
  gateProfileId = 'staff-0000-4000-a000-00000000insi'
  storedSegment = null
  vi.clearAllMocks()
  requireAdmin.mockImplementation(async () => {
    // A denied gate redirects, which surfaces as a thrown error inside an action (Next behavior).
    if (gateProfileId === null) throw new Error('NEXT_REDIRECT')
    return { profileId: gateProfileId, role: 'member', webRole: 'janitor', staffRole: null }
  })
  createSegmentRow.mockImplementation(async () => 'seg-new-id')
  updateSegmentRow.mockImplementation(async () => {})
  deleteSegmentRow.mockImplementation(async () => {})
  previewSegmentCount.mockImplementation(async () => 42)
  getSegment.mockImplementation(async () => storedSegment)
})

describe('createSegment — authz', () => {
  it('runs the write-level gate (janitor OR insights/write) before any write', async () => {
    await createSegment({ name: 'Active founders', definition: validDef })
    expect(requireAdmin).toHaveBeenCalledTimes(1)
    expect(requireAdmin).toHaveBeenCalledWith('janitor', { staff: 'insights', staffLevel: 'write' })
  })

  it('a denied gate throws and writes nothing', async () => {
    gateProfileId = null
    await expect(createSegment({ name: 'Active founders', definition: validDef })).rejects.toThrow()
    expect(createSegmentRow).not.toHaveBeenCalled()
  })
})

describe('createSegment — validation', () => {
  it('refuses a blank name and writes nothing', async () => {
    const r = await createSegment({ name: '   ', definition: validDef })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/name/i)
    expect(createSegmentRow).not.toHaveBeenCalled()
  })

  it('refuses a registry-invalid definition (the real validator runs) and writes nothing', async () => {
    const r = await createSegment({ name: 'Bad', definition: invalidDef })
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
    expect(createSegmentRow).not.toHaveBeenCalled()
  })

  it('refuses an empty predicate list', async () => {
    const r = await createSegment({ name: 'Empty', definition: { combinator: 'all', predicates: [] } })
    expect(r.ok).toBe(false)
    expect(createSegmentRow).not.toHaveBeenCalled()
  })
})

describe('createSegment — persist', () => {
  it('a valid create stamps the gated caller as created_by, trims, and revalidates the index', async () => {
    const r = await createSegment({ name: '  Active founders  ', description: '  the OG cohort ', definition: validDef })
    expect(r.ok).toBe(true)
    expect(r.id).toBe('seg-new-id')
    expect(createSegmentRow).toHaveBeenCalledTimes(1)
    const [input, createdBy] = createSegmentRow.mock.calls[0] as unknown as [
      { name: string; description?: string; definition: unknown },
      string,
    ]
    expect(input).toEqual({ name: 'Active founders', description: 'the OG cohort', definition: validDef })
    expect(createdBy).toBe('staff-0000-4000-a000-00000000insi')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/segments')
  })

  it('reports a friendly error (not a throw) when the DB write fails', async () => {
    createSegmentRow.mockRejectedValueOnce(new Error('duplicate slug'))
    const r = await createSegment({ name: 'Active founders', definition: validDef })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('duplicate slug')
  })
})

describe('updateSegment — gating + system refusal', () => {
  it('gates, then 404s a missing segment without writing', async () => {
    storedSegment = null
    const r = await updateSegment({ id: 'gone', name: 'X', definition: validDef })
    expect(requireAdmin).toHaveBeenCalledTimes(1)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/no longer exists/i)
    expect(updateSegmentRow).not.toHaveBeenCalled()
  })

  it('refuses to edit a built-in (is_system) segment', async () => {
    storedSegment = { id: 's1', slug: 'all-hosts', name: 'All hosts', description: null, is_system: true, definition: validDef }
    const r = await updateSegment({ id: 's1', name: 'Hacked', definition: validDef })
    expect(r.ok).toBe(false)
    expect(updateSegmentRow).not.toHaveBeenCalled()
  })

  it('a valid update of a non-system segment writes and revalidates', async () => {
    storedSegment = { id: 's2', slug: 'active-founders', name: 'Active founders', description: null, is_system: false, definition: validDef }
    const r = await updateSegment({ id: 's2', name: 'Active founders', definition: validDef })
    expect(r.ok).toBe(true)
    expect(updateSegmentRow).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/segments')
  })

  it('still validates the definition on update (registry-invalid is refused)', async () => {
    storedSegment = { id: 's3', slug: 'x', name: 'X', description: null, is_system: false, definition: validDef }
    const r = await updateSegment({ id: 's3', name: 'X', definition: invalidDef })
    expect(r.ok).toBe(false)
    expect(updateSegmentRow).not.toHaveBeenCalled()
  })
})

describe('deleteSegment — gating + system refusal', () => {
  it('refuses to delete a built-in segment', async () => {
    storedSegment = { id: 's4', slug: 'all', name: 'All', description: null, is_system: true, definition: validDef }
    const r = await deleteSegment('s4')
    expect(r.ok).toBe(false)
    expect(deleteSegmentRow).not.toHaveBeenCalled()
  })

  it('deletes a non-system segment and revalidates', async () => {
    storedSegment = { id: 's5', slug: 'tmp', name: 'Temp', description: null, is_system: false, definition: validDef }
    const r = await deleteSegment('s5')
    expect(r.ok).toBe(true)
    expect(deleteSegmentRow).toHaveBeenCalledWith('s5')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/segments')
  })
})

describe('previewSegment — gated, fail-soft', () => {
  it('gates, then reports valid + the count for a valid definition', async () => {
    const r = await previewSegment(validDef)
    expect(requireAdmin).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ count: 42, valid: true })
    expect(previewSegmentCount).toHaveBeenCalledTimes(1)
  })

  it('reports { count: 0, valid: false } for an invalid definition without counting', async () => {
    const r = await previewSegment(invalidDef)
    expect(r).toEqual({ count: 0, valid: false })
    expect(previewSegmentCount).not.toHaveBeenCalled()
  })
})
