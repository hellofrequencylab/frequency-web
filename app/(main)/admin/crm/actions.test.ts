import { describe, it, expect, beforeEach, vi } from 'vitest'

// GLOBAL DEAL CREATE — the default pipeline stage MUST come from the ROOT space. This global CRM seeds
// root-owned deals; every Space seeds its own stages at sort_order=0, so an UNSCOPED first-stage lookup
// could hand a new deal a FOREIGN Space's stage_id (invisible on the root board, yet counted in metrics).
// This locks that firstStageId() filters crm_stages by the root space id, and degrades safely (null stage)
// when no root space exists. The Supabase/auth/store seams are stubbed with a recording admin client.

const h = vi.hoisted(() => {
  const state = {
    ops: [] as unknown[][],
    rootStageId: 'root-stage' as string | null,
    stageKind: 'open' as string,
    dealInsertError: null as unknown,
  }
  const admin = {
    from(table: string) {
      let selectedCol = ''
      const c: Record<string, unknown> = {
        select: (col: string) => {
          selectedCol = col
          state.ops.push([`${table}.select`, col])
          return c
        },
        insert: (row: unknown) => {
          state.ops.push([`${table}.insert`, row])
          return c
        },
        eq: (col: string, val: unknown) => {
          state.ops.push(['eq', col, val])
          return c
        },
        order: () => c,
        limit: () => c,
        maybeSingle: async () => {
          if (table === 'crm_stages' && selectedCol === 'id') {
            return { data: state.rootStageId ? { id: state.rootStageId } : null }
          }
          if (table === 'crm_stages' && selectedCol === 'kind') return { data: { kind: state.stageKind } }
          if (table === 'crm_deals') return { data: { id: 'deal-1' }, error: state.dealInsertError }
          return { data: null }
        },
      }
      return c
    },
  }
  return { state, admin }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: vi.fn() }))
vi.mock('@/lib/admin/guard', () => ({ authorizeAction: vi.fn() }))
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: vi.fn() }))

import { getCallerProfile } from '@/lib/auth'
import { authorizeAction } from '@/lib/admin/guard'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { createDeal } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  h.state.ops = []
  h.state.rootStageId = 'root-stage'
  h.state.stageKind = 'open'
  h.state.dealInsertError = null
  vi.mocked(getCallerProfile).mockResolvedValue({ id: 'me' } as never)
  vi.mocked(authorizeAction).mockResolvedValue({ id: 'me' } as never)
  vi.mocked(loadRootSpaceId).mockResolvedValue('root-space')
})

describe('createDeal — the default stage is scoped to the ROOT space', () => {
  it('filters the first-stage lookup by the root space id and stamps that stage on the deal', async () => {
    const res = await createDeal({ title: 'New deal' })
    expect('data' in res).toBe(true)
    // The default-stage lookup MUST filter crm_stages by the root space id, never any Space's stage.
    expect(h.state.ops).toContainEqual(['eq', 'space_id', 'root-space'])
    const insert = h.state.ops.find((o) => o[0] === 'crm_deals.insert')!
    expect(insert[1]).toMatchObject({ stage_id: 'root-stage' })
  })
  it('respects an explicit stageId without touching the root-stage lookup', async () => {
    const res = await createDeal({ title: 'Explicit', stageId: 'chosen' })
    expect('data' in res).toBe(true)
    expect(h.state.ops.some((o) => o[0] === 'eq' && o[1] === 'space_id')).toBe(false)
    const insert = h.state.ops.find((o) => o[0] === 'crm_deals.insert')!
    expect(insert[1]).toMatchObject({ stage_id: 'chosen' })
  })
  it('degrades to a null stage (no foreign fallback) when the root space is missing', async () => {
    vi.mocked(loadRootSpaceId).mockResolvedValue(null)
    const res = await createDeal({ title: 'Orphan' })
    expect('data' in res).toBe(true)
    // No root space → no space-scoped stage query is issued (never a cross-space stage).
    expect(h.state.ops.some((o) => o[0] === 'eq' && o[1] === 'space_id')).toBe(false)
    const insert = h.state.ops.find((o) => o[0] === 'crm_deals.insert')!
    expect(insert[1]).toMatchObject({ stage_id: null })
  })
})
