import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 0 ownership contract for CIRCLES (ENTITY-SPACES-BUILD Epic 0.3 / §4.3). Locks two things:
//   1. STAMP — a new circle defaults its space_id to the ROOT space (so the existing
//      single-tenant create flow behaves exactly as today, the canary).
//   2. ISOLATION — listCirclesForSpace filters by space_id, so a circle in space A can never
//      resolve for space B.
//
// And, since ADR-1094, the third: VISIBILITY. `listCirclesForSpace` is the RAW read and four public
// callers reached for it, so an unlisted circle rendered on a Space's public Home page, in the
// entity Community module, in the hero's "Circles" stat and in the has-content gate. The rule lives
// in `listPublicSpaceCircles` now, and the tests below fail against the pre-fix tree.

const ROOT_ID = 'f0000000-0000-4000-a000-00000000root'
const SPACE_A = 'aaaaaaaa-0000-4000-a000-00000000000a'
const SPACE_B = 'bbbbbbbb-0000-4000-a000-00000000000b'

type Row = Record<string, unknown>

// A fake query builder with just enough of PostgREST to hold the two things that matter: which
// filters were applied, and whether they ran BEFORE the limit. Rows come from `db[table]`.
const db: { circles: Row[]; memberships: Row[] } = { circles: [], memberships: [] }
const seen: { or: string[]; limitedAt: number[] } = { or: [], limitedAt: [] }

function builder(table: 'circles' | 'memberships') {
  const eqs: Array<[string, unknown]> = []
  let orClause: string | null = null
  // PostgREST ANDs every .in() together, and `myCirclesInSpace` now issues two (status, then id),
  // so a single-slot inClause would silently drop the first filter and let this fake pass a tree
  // that filters on neither.
  const inClauses: Array<{ col: string; vals: unknown[] }> = []

  function rows(): Row[] {
    let out = db[table] ?? []
    for (const [col, val] of eqs) out = out.filter((r) => r[col] === val)
    for (const c of inClauses) out = out.filter((r) => c.vals.includes(r[c.col]))
    // The ONE predicate axis 1 is allowed to be spelled as. `unlisted` is nullable and a NULL row
    // is a LISTED row, which is why a bare `.eq('unlisted', false)` would be wrong: it would drop
    // every circle written before the column existed.
    if (orClause === 'unlisted.is.null,unlisted.eq.false') out = out.filter((r) => r.unlisted !== true)
    else if (orClause) throw new Error(`unexpected or() clause: ${orClause}`)
    return out
  }

  const api = {
    select: () => api,
    eq(col: string, val: unknown) {
      eqs.push([col, val])
      return api
    },
    or(clause: string) {
      orClause = clause
      seen.or.push(clause)
      return api
    },
    in(col: string, vals: unknown[]) {
      inClauses.push({ col, vals })
      return api
    },
    order: () => api,
    async limit(n: number) {
      // Recording the pre-limit count is the whole point: a filter applied AFTER the limit lets a
      // hidden row eat a visible row's slot, which is how a six-slot block ends up showing five.
      const filtered = rows()
      seen.limitedAt.push(filtered.length)
      return { data: filtered.slice(0, n), error: null }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: 'circles' | 'memberships') => builder(t) }),
}))

vi.mock('@/lib/spaces/store', () => ({
  loadRootSpaceId: async () => ROOT_ID,
}))

import { stampCircleSpaceId, listCirclesForSpace, listPublicSpaceCircles } from './store'

/** A circle row with the defaults a live row carries, so each test states only what it is about. */
function circle(over: Row): Row {
  return { space_id: SPACE_A, status: 'active', unlisted: false, access: 'open', created_at: '2026-01-01', ...over }
}

beforeEach(() => {
  db.circles = []
  db.memberships = []
  seen.or = []
  seen.limitedAt = []
})

describe('stampCircleSpaceId (create defaults to root)', () => {
  it('STAMP: with no spaceId, a new circle is stamped to the ROOT space', async () => {
    expect(await stampCircleSpaceId()).toBe(ROOT_ID)
  })

  it('a space-scoped caller stamps its own space', async () => {
    expect(await stampCircleSpaceId(SPACE_A)).toBe(SPACE_A)
  })
})

describe('listCirclesForSpace (the RAW by-space read)', () => {
  it('CANARY: with no spaceId, reads the ROOT space rows', async () => {
    db.circles = [circle({ id: 'c1', space_id: ROOT_ID, name: 'Root circle' })]
    expect((await listCirclesForSpace()).map((r) => r.id)).toEqual(['c1'])
  })

  it('ISOLATION: a circle saved for space A never resolves for space B', async () => {
    db.circles = [circle({ id: 'a1', name: 'A only' })]
    expect((await listCirclesForSpace(SPACE_A)).map((r) => r.id)).toEqual(['a1'])
    expect(await listCirclesForSpace(SPACE_B)).toEqual([])
  })

  it('stays RAW on purpose: an owner console must still see the hidden and the archived', async () => {
    db.circles = [
      circle({ id: 'open1' }),
      circle({ id: 'hidden1', unlisted: true }),
      circle({ id: 'gone1', status: 'archived' }),
    ]
    expect((await listCirclesForSpace(SPACE_A)).map((r) => r.id).sort()).toEqual(['gone1', 'hidden1', 'open1'])
  })
})

describe('listPublicSpaceCircles (ADR-1094 — the rule, in one place)', () => {
  it('AXIS 1: an UNLISTED circle never reaches a visitor', async () => {
    db.circles = [circle({ id: 'shown' }), circle({ id: 'hidden', unlisted: true })]
    expect((await listPublicSpaceCircles(SPACE_A)).map((r) => r.id)).toEqual(['shown'])
  })

  it('a NULL `unlisted` is a LISTED circle (rows written before the column existed)', async () => {
    db.circles = [circle({ id: 'legacy', unlisted: null })]
    expect((await listPublicSpaceCircles(SPACE_A)).map((r) => r.id)).toEqual(['legacy'])
    expect(seen.or).toContain('unlisted.is.null,unlisted.eq.false')
  })

  it('AXIS 2 is NOT applied: a listed CLOSED circle is the lead funnel and must still show', async () => {
    db.circles = [
      circle({ id: 'open1', access: 'open' }),
      circle({ id: 'closed1', access: 'circle_members' }),
      circle({ id: 'paid1', access: 'tier' }),
    ]
    expect((await listPublicSpaceCircles(SPACE_A)).map((r) => r.id).sort()).toEqual(['closed1', 'open1', 'paid1'])
  })

  it('drops archived circles without the caller having to remember to', async () => {
    db.circles = [circle({ id: 'live' }), circle({ id: 'gone', status: 'archived' })]
    expect((await listPublicSpaceCircles(SPACE_A)).map((r) => r.id)).toEqual(['live'])
  })

  it('ISOLATION holds here too', async () => {
    db.circles = [circle({ id: 'a1' })]
    expect(await listPublicSpaceCircles(SPACE_B)).toEqual([])
  })

  it('BOTH filters run before LIMIT, so a hidden circle cannot eat a visible slot', async () => {
    db.circles = [
      circle({ id: 'hidden', unlisted: true }),
      circle({ id: 'gone', status: 'archived' }),
      circle({ id: 'v1' }),
      circle({ id: 'v2' }),
    ]
    const out = await listPublicSpaceCircles(SPACE_A, { limit: 2 })
    // The pre-fix shape fetched 2 rows and filtered afterwards, which returned ZERO here.
    expect(out.map((r) => r.id).sort()).toEqual(['v1', 'v2'])
    // Nothing was ever handed a limit over an unfiltered set.
    expect(seen.limitedAt).not.toContain(4)
  })

  it('a viewer still sees their OWN unlisted circle, the same courtesy /circles extends', async () => {
    db.circles = [circle({ id: 'shown' }), circle({ id: 'mine', unlisted: true })]
    db.memberships = [{ circle_id: 'mine', profile_id: 'p-own', status: 'active' }]
    const out = await listPublicSpaceCircles(SPACE_A, { viewerProfileId: 'p-own' })
    expect(out.map((r) => r.id).sort()).toEqual(['mine', 'shown'])
  })

  it('and only their OWN: someone else’s membership does not un-hide it', async () => {
    db.circles = [circle({ id: 'shown' }), circle({ id: 'theirs', unlisted: true })]
    db.memberships = [{ circle_id: 'theirs', profile_id: 'p-them', status: 'active' }]
    const out = await listPublicSpaceCircles(SPACE_A, { viewerProfileId: 'p-nobody' })
    expect(out.map((r) => r.id)).toEqual(['shown'])
  })

  it('a LAPSED membership does not un-hide it either', async () => {
    db.circles = [circle({ id: 'hidden', unlisted: true })]
    db.memberships = [{ circle_id: 'hidden', profile_id: 'p-lapsed', status: 'left' }]
    expect(await listPublicSpaceCircles(SPACE_A, { viewerProfileId: 'p-lapsed' })).toEqual([])
  })

  it('a member’s own circle in ANOTHER space does not leak onto this Space’s tab', async () => {
    db.circles = [circle({ id: 'elsewhere', space_id: SPACE_B, unlisted: true })]
    db.memberships = [{ circle_id: 'elsewhere', profile_id: 'p-mine2', status: 'active' }]
    expect(await listPublicSpaceCircles(SPACE_A, { viewerProfileId: 'p-mine2' })).toEqual([])
  })

  it('the merged set is deduped and newest first', async () => {
    db.circles = [
      circle({ id: 'old', created_at: '2026-01-01' }),
      circle({ id: 'new', created_at: '2026-06-01' }),
      circle({ id: 'mine', unlisted: true, created_at: '2026-03-01' }),
    ]
    db.memberships = [
      // Also a member of a LISTED one, which is where a naive merge produces a duplicate card.
      { circle_id: 'mine', profile_id: 'p-dedup', status: 'active' },
      { circle_id: 'new', profile_id: 'p-dedup', status: 'active' },
    ]
    const out = await listPublicSpaceCircles(SPACE_A, { viewerProfileId: 'p-dedup' })
    expect(out.map((r) => r.id)).toEqual(['new', 'mine', 'old'])
  })

  it('includeHidden is the OWNER path: hidden yes, archived still no', async () => {
    db.circles = [circle({ id: 'shown' }), circle({ id: 'hidden', unlisted: true }), circle({ id: 'gone', status: 'archived' })]
    const out = await listPublicSpaceCircles(SPACE_A, { includeHidden: true })
    expect(out.map((r) => r.id).sort()).toEqual(['hidden', 'shown'])
    // No axis-1 predicate was sent at all on this path.
    expect(seen.or).toEqual([])
  })

  // LIVE-093. status is the LIFECYCLE axis, not axis 1 or axis 2, and this reader pinned it to
  // 'active' while every other public reader admitted 'forming' too. The operator create path
  // defaults new rows to 'forming', so the filter hid precisely the Circles an operator had just
  // made: no Circles tab at all (profile-nav gates on presence.circles, which flows from here),
  // a "Circles 0" hero stat, and an empty state on a page the manage console listed rows on.
  // Live in production when found — a real Space had 2 forming Circles and a suppressed tab.
  describe('the lifecycle axis (LIVE-093)', () => {
    it('lists a FORMING circle alongside an active one', async () => {
      db.circles = [circle({ id: 'live' }), circle({ id: 'gathering', status: 'forming' })]
      const out = await listPublicSpaceCircles(SPACE_A)
      expect(out.map((r) => r.id).sort()).toEqual(['gathering', 'live'])
    })

    it('still refuses draft and archived — they are not Circles anyone else may see', async () => {
      db.circles = [
        circle({ id: 'live' }),
        circle({ id: 'gathering', status: 'forming' }),
        circle({ id: 'notyet', status: 'draft' }),
        circle({ id: 'gone', status: 'archived' }),
      ]
      const out = await listPublicSpaceCircles(SPACE_A)
      expect(out.map((r) => r.id).sort()).toEqual(['gathering', 'live'])
    })

    it('applies on the OWNER path too, so preview matches the manage console', async () => {
      db.circles = [circle({ id: 'gathering', status: 'forming', unlisted: true })]
      const out = await listPublicSpaceCircles(SPACE_A, { includeHidden: true })
      expect(out.map((r) => r.id)).toEqual(['gathering'])
    })

    it("applies to the viewer's OWN circles, so a forming circle they joined still resolves", async () => {
      db.circles = [circle({ id: 'mine', status: 'forming', unlisted: true })]
      db.memberships = [{ circle_id: 'mine', profile_id: 'p-mine', status: 'active' }]
      const out = await listPublicSpaceCircles(SPACE_A, { viewerProfileId: 'p-mine' })
      expect(out.map((r) => r.id)).toEqual(['mine'])
    })
  })

  it('FAIL-SAFE: a missing tenant hides circles rather than publishing them', async () => {
    db.circles = [circle({ id: 'a1' })]
    expect(await listPublicSpaceCircles(null)).toEqual([])
    expect(await listPublicSpaceCircles(undefined)).toEqual([])
  })
})
