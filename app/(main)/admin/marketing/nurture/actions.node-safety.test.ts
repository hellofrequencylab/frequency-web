import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NODE_LAYOUT_WRITE_ERROR } from '@/lib/entity-blocks/legacy-write-guard'
const state = vi.hoisted(() => ({ caller: { id: 'marketer' } as { id: string } | null, stored: { block_json: { rows: [] } } as { block_json: unknown } | null, writes: [] as unknown[], readError: null as { message: string } | null }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => state.caller }))
vi.mock('@/lib/core/roles', () => ({ isStaff: () => true }))
vi.mock('@/lib/staff', () => ({ getStaffMember: async () => null, staffCan: () => false }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => {
  const builder = { select: () => builder, update: (value: unknown) => { state.writes.push(value); return builder }, eq: () => builder, maybeSingle: async () => ({ data: state.stored, error: state.readError }), then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ error: null })) }
  return builder
} }) }))
import { updateStepBlockJson } from './actions'
const native = { rows: [], bench: [{ nid: 'nbench01', type: 'text', content: { text: 'Author work' } }] }
beforeEach(() => { state.caller = { id: 'marketer' }; state.stored = { block_json: { rows: [] } }; state.writes = []; state.readError = null })
describe('nurture native email writer protection', () => {
  it('refuses incompatible incoming and stale stored-native saves without writes', async () => {
    expect(await updateStepBlockJson('step-1', native as never)).toEqual({ error: NODE_LAYOUT_WRITE_ERROR })
    state.stored = { block_json: native }
    const before = JSON.stringify(state.stored)
    expect(await updateStepBlockJson('step-1', { rows: [] })).toEqual({ error: NODE_LAYOUT_WRITE_ERROR })
    expect(JSON.stringify(state.stored)).toBe(before)
    expect(state.writes).toEqual([])
  })
  it('keeps authorization first and read failures closed', async () => {
    state.caller = null
    expect(await updateStepBlockJson('step-1', native as never)).toEqual({ error: 'Sign in first.' })
    state.caller = { id: 'marketer' }; state.readError = { message: 'offline' }
    expect(await updateStepBlockJson('step-1', { rows: [] })).toEqual({ error: 'Could not read the saved email design.' })
    expect(state.writes).toEqual([])
  })
  it('retains ordinary legacy author edits', async () => {
    const layout = { rows: [{ id: 'r0', columns: 1 as const, cells: [['text']] }], content: { text: { text: 'Legacy copy' } } }
    expect(await updateStepBlockJson('step-1', layout)).toEqual({})
    expect(state.writes).toEqual([{ block_json: layout }])
  })
})
