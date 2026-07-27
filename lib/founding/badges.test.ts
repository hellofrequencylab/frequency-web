import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// THE FOUNDING BUSINESS BADGE READERS (ADR-873). Two halves are locked here:
//
//   1. FUNCTIONAL — over a tiny fake PostgREST (the tier-circle.test.ts pattern):
//      ONLY status='active' + kind='business' earns a badge ('reserved' has not graduated,
//      'lapsed' fell out, a member-kind row is not a Space founder); the batched reader
//      returns a Map keyed by space id; empty input returns an empty Map and issues NO
//      query; many ids cost ONE query (no N+1); every read is fail-safe.
//
//   2. SOURCE-SHAPE — the PUBLIC badge never renders the locked rate. locked_rate_cents is a
//      private commercial term between the operator and Frequency, so a rewrite that pipes it
//      into the chip (or into the public mount sites) fails here instead of shipping a price
//      tag on a storefront.

type Row = Record<string, unknown>

const state = {
  founding: [] as Row[],
  /** Every select issued against founding_members, so "one query for N ids" is assertable. */
  selects: [] as Array<{ table: string; ids: readonly unknown[] | null }>,
  throwOnSelect: false,
}

function builder(table: string) {
  const filters: Array<[string, unknown]> = []
  let inFilter: { col: string; vals: readonly unknown[] } | null = null
  const matching = () =>
    state.founding
      .filter((r) => filters.every(([col, val]) => r[col] === val))
      .filter((r) => (inFilter ? inFilter.vals.includes(r[inFilter.col]) : true))
  const api = {
    select() {
      return api
    },
    eq(col: string, val: unknown) {
      filters.push([col, val])
      return api
    },
    neq() {
      return api
    },
    in(col: string, vals: readonly unknown[]) {
      inFilter = { col, vals }
      state.selects.push({ table, ids: vals })
      if (state.throwOnSelect) throw new Error('boom')
      return api
    },
    maybeSingle() {
      return Promise.resolve({ data: matching()[0] ?? null, error: null })
    },
    then(resolve: (v: { data: Row[]; error: null }) => void) {
      resolve({ data: matching(), error: null })
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}))

vi.mock('@/lib/pricing/settings', () => ({
  getFoundingConfig: vi.fn(async () => ({
    member_one_time_cents: 25000,
    member_cap: 150,
    business_monthly_cents: 4900,
    business_take_bps: 300,
    business_city_cap: 25,
  })),
}))

import { foundingBadgeForSpace, foundingBadgesForSpaces } from './status'

const SPACE_ACTIVE = 'aaaaaaaa-0000-4000-a000-000000active'
const SPACE_RESERVED = 'bbbbbbbb-0000-4000-a000-0000reserved'
const SPACE_LAPSED = 'cccccccc-0000-4000-a000-00000lapsed'
const SPACE_NONE = 'dddddddd-0000-4000-a000-000000000no'
const SPACE_ACTIVE_2 = 'eeeeeeee-0000-4000-a000-00000active2'

beforeEach(() => {
  state.selects.length = 0
  state.throwOnSelect = false
  state.founding = [
    { space_id: SPACE_ACTIVE, kind: 'business', status: 'active', locked_rate_cents: 4900 },
    { space_id: SPACE_ACTIVE_2, kind: 'business', status: 'active', locked_rate_cents: null },
    { space_id: SPACE_RESERVED, kind: 'business', status: 'reserved', locked_rate_cents: 4900 },
    { space_id: SPACE_LAPSED, kind: 'business', status: 'lapsed', locked_rate_cents: 4900 },
  ]
})

describe('foundingBadgeForSpace - only an ACTIVE grant is a badge', () => {
  it('badges a Space with an active business row', async () => {
    expect(await foundingBadgeForSpace(SPACE_ACTIVE)).toEqual({
      isFounding: true,
      kind: 'business',
      lockedRateCents: 4900,
    })
  })

  it('does NOT badge a reserved Space (the spot is held, it has not graduated)', async () => {
    expect(await foundingBadgeForSpace(SPACE_RESERVED)).toBeNull()
  })

  it('does NOT badge a lapsed Space (it fell out of the cohort)', async () => {
    expect(await foundingBadgeForSpace(SPACE_LAPSED)).toBeNull()
  })

  it('returns null for a Space with no founding row at all', async () => {
    expect(await foundingBadgeForSpace(SPACE_NONE)).toBeNull()
  })

  it('does NOT badge a member-kind row that happens to carry a space id', async () => {
    state.founding = [{ space_id: SPACE_NONE, kind: 'member', status: 'active', locked_rate_cents: 25000 }]
    expect(await foundingBadgeForSpace(SPACE_NONE)).toBeNull()
  })

  it('carries a null locked rate through rather than inventing one', async () => {
    expect((await foundingBadgeForSpace(SPACE_ACTIVE_2))?.lockedRateCents).toBeNull()
  })

  it('costs no query for a blank / null space id', async () => {
    expect(await foundingBadgeForSpace('')).toBeNull()
    expect(await foundingBadgeForSpace(null)).toBeNull()
    expect(await foundingBadgeForSpace(undefined)).toBeNull()
    expect(state.selects).toHaveLength(0)
  })
})

describe('foundingBadgesForSpaces - batched, keyed by space id', () => {
  it('returns a Map keyed by space id holding ONLY the active founders', async () => {
    const map = await foundingBadgesForSpaces([SPACE_ACTIVE, SPACE_RESERVED, SPACE_LAPSED, SPACE_NONE, SPACE_ACTIVE_2])
    expect(map).toBeInstanceOf(Map)
    expect([...map.keys()].sort()).toEqual([SPACE_ACTIVE, SPACE_ACTIVE_2].sort())
    expect(map.get(SPACE_ACTIVE)).toEqual({ isFounding: true, kind: 'business', lockedRateCents: 4900 })
    expect(map.has(SPACE_RESERVED)).toBe(false)
    expect(map.has(SPACE_LAPSED)).toBe(false)
    expect(map.has(SPACE_NONE)).toBe(false)
  })

  it('empty input returns an empty Map and issues NO query', async () => {
    const map = await foundingBadgesForSpaces([])
    expect(map.size).toBe(0)
    expect(state.selects).toHaveLength(0)
  })

  it('drops blank ids and de-dupes, and a whole grid costs ONE query (no N+1)', async () => {
    const map = await foundingBadgesForSpaces([SPACE_ACTIVE, SPACE_ACTIVE, '', SPACE_RESERVED, SPACE_NONE])
    expect(state.selects).toHaveLength(1)
    expect(state.selects[0].table).toBe('founding_members')
    expect(state.selects[0].ids).toEqual([SPACE_ACTIVE, SPACE_RESERVED, SPACE_NONE])
    expect(map.size).toBe(1)
  })

  it('an all-blank id list still issues NO query', async () => {
    expect((await foundingBadgesForSpaces(['', ''])).size).toBe(0)
    expect(state.selects).toHaveLength(0)
  })

  it('FAIL-SAFE: a read error yields an empty Map, never a fabricated founder', async () => {
    state.throwOnSelect = true
    expect((await foundingBadgesForSpaces([SPACE_ACTIVE])).size).toBe(0)
    expect(await foundingBadgeForSpace(SPACE_ACTIVE)).toBeNull()
  })

  it('skips a row with a missing space id instead of keying the Map on garbage', async () => {
    state.founding = [{ space_id: null, kind: 'business', status: 'active', locked_rate_cents: 4900 }]
    expect((await foundingBadgesForSpaces([SPACE_ACTIVE])).size).toBe(0)
  })
})

// ── SOURCE-SHAPE: the public badge is a STATUS, never a price tag ──────────────────────────────────
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('source shape: the public Founding Business badge never renders the locked rate', () => {
  const roles = src('lib/community-roles.tsx')
  // The component body, isolated so the file's other chips are not what we are asserting about.
  const body = roles.slice(roles.indexOf('export function FoundingBusinessBadge'))

  it('the chip takes only `founding` + `className` (no rate prop of any spelling)', () => {
    expect(body).toContain('founding?: boolean | null')
    expect(body).not.toMatch(/lockedRateCents|locked_rate_cents|rateCents|priceCents/)
  })

  it('the chip carries the locked label and a tooltip with no pricing in it', () => {
    expect(body).toContain('Founding Business')
    const title = body.match(/title="([^"]+)"/)?.[1] ?? ''
    expect(title).toContain('Founding Business')
    expect(title).not.toMatch(/\$|\d|month|rate|price|cents/i)
  })

  it('the public mount sites hand it a boolean, never the founding record', () => {
    for (const path of [
      'components/spaces/space-card.tsx',
      'app/(main)/spaces/[slug]/(profile)/layout.tsx',
    ]) {
      const file = src(path)
      expect(file).toContain('FoundingBusinessBadge')
      expect(file).not.toMatch(/lockedRateCents|locked_rate_cents/)
    }
  })

  it('the directory card model exposes a boolean only, so a rate can never reach a card', () => {
    const discovery = src('lib/spaces/discovery.ts')
    expect(discovery).toContain('isFoundingBusiness: boolean')
    expect(discovery).not.toMatch(/lockedRateCents|locked_rate_cents/)
  })
})
