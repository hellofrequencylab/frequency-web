import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import { sourceWithoutComments } from '@/test/source-shape'
import { isError } from '@/lib/action-result'

// SCAN-775 — personal marketing codes never showed on /codes but still filled the 3-code limit.
//
// THE DEFECT. The /codes list required `space_id IS NULL`, but the BEFORE INSERT trigger
// qr_codes_default_space_id stamps every null space_id with the ROOT Space, so the list matched
// nothing. The limit count in createMarketingCode had NO space filter, so a member's plain Space
// codes (owner_profile_id stamped, purpose null, space_id = their Space) ate the personal quota.
// Net: "created" codes vanished and the member was told to delete one with nothing to delete.
//
// RUNTIME for the count (a table-driven admin mock applies the real PostgREST filters the action
// sends) and a source-shape pin that the list and the count share ONE scope helper.

const ROOT = 'root-space-0000-4000-a000-000000000001'
const ME = 'member-0000-4000-a000-00000000000me'

vi.mock('@/lib/auth', () => ({
  getCallerProfile: async () => ({ id: ME }),
  getMyProfileId: async () => ME,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => ROOT }))

type Row = Record<string, unknown>
let rows: Row[] = []
const inserted: Row[] = []

// A thin PostgREST mock: eq / is / or('a.is.null,b.eq.x') filters over the in-memory qr_codes rows,
// head+count returns the count of what survives, insert records the row.
function builder() {
  const filters: Array<(r: Row) => boolean> = []
  const api = {
    select: () => api,
    eq: (col: string, v: unknown) => { filters.push((r) => r[col] === v); return api },
    is: (col: string, v: unknown) => { filters.push((r) => r[col] === v); return api },
    or: (expr: string) => {
      const arms = expr.split(',').map((arm) => {
        const m = /^(\w+)\.(is|eq)\.(.+)$/.exec(arm)
        if (!m) throw new Error(`unparsed or() arm: ${arm}`)
        const [, col, op, val] = m
        return (r: Row) => (op === 'is' ? r[col] === (val === 'null' ? null : val) : r[col] === val)
      })
      filters.push((r) => arms.some((a) => a(r)))
      return api
    },
    order: () => api,
    insert: (row: Row) => {
      inserted.push(row)
      return { select: () => ({ single: async () => ({ data: { id: 'new-code' }, error: null }) }) }
    },
    then: (resolve: (v: unknown) => void) => {
      const data = rows.filter((r) => filters.every((f) => f(r)))
      resolve({ data, count: data.length, error: null })
    },
  }
  return api
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => builder() }),
}))

const personal = (n: number): Row => ({ id: `p${n}`, owner_profile_id: ME, purpose: null, space_id: ROOT })
const spaceCode = (n: number): Row => ({ id: `s${n}`, owner_profile_id: ME, purpose: null, space_id: `space-${n}` })
const input = { title: 'Flyer', path: '/circles/sunrise', style: {} as never }

beforeEach(() => {
  rows = []
  inserted.length = 0
})

describe('personalMarketingSpaceFilter (SCAN-775)', () => {
  it('admits the root-stamped row the trigger always writes, and degrades to null-only without a root', async () => {
    const { personalMarketingSpaceFilter } = await import('@/lib/qr/marketing')
    expect(personalMarketingSpaceFilter(ROOT)).toBe(`space_id.is.null,space_id.eq.${ROOT}`)
    expect(personalMarketingSpaceFilter(null)).toBe('space_id.is.null')
  })
})

describe('createMarketingCode counts only personal codes (SCAN-775)', () => {
  it('a member with three Space codes and no personal code can still create one', async () => {
    rows = [spaceCode(1), spaceCode(2), spaceCode(3)]
    const { createMarketingCode } = await import('./actions')
    const res = await createMarketingCode(input)
    expect(isError(res), 'Space codes ate the personal quota').toBe(false)
    expect(inserted).toHaveLength(1)
  })

  it('three root-stamped personal codes still hit the limit', async () => {
    rows = [personal(1), personal(2), personal(3)]
    const { createMarketingCode } = await import('./actions')
    const res = await createMarketingCode(input)
    expect(isError(res)).toBe(true)
    expect(inserted).toHaveLength(0)
  })

  it('a legacy null-space personal code counts too', async () => {
    rows = [personal(1), personal(2), { ...personal(3), space_id: null }]
    const { createMarketingCode } = await import('./actions')
    const res = await createMarketingCode(input)
    expect(isError(res)).toBe(true)
  })
})

describe('the list and the count read the same personal scope (SCAN-775)', () => {
  const page = sourceWithoutComments(path.join(import.meta.dirname, 'page.tsx'))
  const actions = sourceWithoutComments(path.join(import.meta.dirname, 'actions.ts'))

  it('neither side spells the scope as a bare null space_id', () => {
    expect(page).not.toMatch(/\.is\(['"]space_id['"], null\)/)
    expect(actions).not.toMatch(/\.is\(['"]space_id['"], null\)/)
  })

  it('both sides call personalMarketingSpaceFilter', () => {
    expect(page).toContain('.or(personalMarketingSpaceFilter(')
    const count = actions.match(/count: ['"]exact['"][\s\S]*?MARKETING_CODE_LIMIT/)
    expect(count).not.toBeNull()
    expect(count![0]).toContain('.or(personalMarketingSpaceFilter(')
  })
})
