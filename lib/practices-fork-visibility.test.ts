import { describe, it, expect, vi, beforeEach } from 'vitest'

// SCAN-726: forkPractice reads through the admin client, so RLS does not apply, and it used to
// copy ANY practice reachable by uuid (body, description, header image, movement config) into a
// private copy owned by the caller, which forkPracticeAction then opened in the editor. A member
// holding another member's private or pending practice uuid could read the full guide the detail
// page refuses to show them. claimPractice rode the same path and also paid the first-claim Zaps
// for a practice that was never a template.
//
// The guard lives in forkPractice so fork and claim both get it: only a practice the caller could
// already read (public, or their own) is copied. claimPractice additionally refuses a non-template.
// Pinned against a tiny in-memory fake of the admin client so each assertion proves the exact
// effect: no insert happens on a refusal.

type Row = Record<string, unknown>
const store: Record<string, Row[]> = { practices: [] }

const ME = 'member-a'
const OTHER = 'member-b'

function practice(over: Partial<Row>): Row {
  return {
    id: 'p-x',
    title: 'Quiet Morning',
    description: null,
    summary: null,
    body: 'The full guide body',
    cadence: 'daily',
    duration_min: 5,
    timer_kind: null,
    movement_config: null,
    category: null,
    icon: 'sun',
    header_image: null,
    domain_id: null,
    focus_details: {},
    subcategory_id: null,
    created_by: OTHER,
    is_public: false,
    is_template: false,
    slug: 'quiet-morning',
    root_practice_id: null,
    ...over,
  }
}

function from(table: string) {
  if (!store[table]) store[table] = []
  const filters: Array<[string, unknown]> = []
  let op: 'select' | 'insert' = 'select'
  let inserted: Row | null = null
  const match = (r: Row) => filters.every(([c, v]) => r[c] === v)
  const run = () => {
    if (op === 'insert') {
      const row = { id: `new-${store[table].length}`, ...inserted! }
      store[table].push(row)
      return { data: [row], error: null }
    }
    return { data: store[table].filter(match), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api,
    insert: (payload: Row) => {
      op = 'insert'
      inserted = payload
      return api
    },
    eq: (c: string, v: unknown) => {
      filters.push([c, v])
      return api
    },
    ilike: () => api,
    async maybeSingle() {
      return { data: run().data[0] ?? null, error: null }
    },
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve(run()).then(resolve)
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => from(t) }),
}))
vi.mock('@/lib/engagement/events', () => ({ recordEngagementEvent: async () => ({ recorded: false }) }))
vi.mock('@/lib/analytics/track', () => ({ track: async () => {} }))
vi.mock('@/lib/achievements', () => ({ recordStreakActivity: async () => {}, processGamificationEvent: async () => {} }))
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => 'root' }))
vi.mock('@/lib/core/roles', () => ({ ROLE_HIERARCHY: ['member', 'crew', 'host'] }))
vi.mock('@/lib/rewards/spark', () => ({ maybeSpark: async () => ({ sparked: false, amount: 0 }) }))
vi.mock('@/lib/rewards/creation', () => ({ awardValidatedCreation: async () => {}, awardCreationToken: async () => {} }))
vi.mock('@/lib/quest/complete', () => ({ tryCompleteJourney: async () => {} }))

import { forkPractice, claimPractice } from './practices'

const copies = () => store.practices.filter((r) => r.remixed_from !== undefined)

beforeEach(() => {
  store.practices = []
})

describe('forkPractice only copies a practice the caller could already read (SCAN-726)', () => {
  it("refuses another member's private practice and inserts nothing", async () => {
    store.practices.push(practice({ is_public: false, created_by: OTHER }))
    expect(await forkPractice(ME, 'p-x')).toBeNull()
    expect(copies()).toHaveLength(0)
  })

  it('copies a public practice', async () => {
    store.practices.push(practice({ is_public: true, created_by: OTHER }))
    const copy = await forkPractice(ME, 'p-x')
    expect(copy).not.toBeNull()
    expect(copies()).toHaveLength(1)
    expect(copies()[0]).toMatchObject({ created_by: ME, is_public: false, remixed_from: 'p-x', body: 'The full guide body' })
  })

  it("copies the caller's own private practice", async () => {
    store.practices.push(practice({ is_public: false, created_by: ME }))
    expect(await forkPractice(ME, 'p-x')).not.toBeNull()
    expect(copies()).toHaveLength(1)
  })

  it('still returns null for an unknown id', async () => {
    expect(await forkPractice(ME, 'nope')).toBeNull()
    expect(copies()).toHaveLength(0)
  })
})

describe('claimPractice only claims a real template the caller can read (SCAN-726)', () => {
  it('refuses a public practice that is not a template, so the claim Zaps never pay out', async () => {
    store.practices.push(practice({ is_public: true, is_template: false, created_by: OTHER }))
    expect(await claimPractice(ME, 'p-x', { title: 'Mine' })).toBeNull()
    expect(copies()).toHaveLength(0)
  })

  it("refuses another member's private practice even when it is flagged a template", async () => {
    store.practices.push(practice({ is_public: false, is_template: true, created_by: OTHER }))
    expect(await claimPractice(ME, 'p-x', { title: 'Mine' })).toBeNull()
    expect(copies()).toHaveLength(0)
  })
})
