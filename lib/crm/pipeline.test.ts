import { describe, it, expect, beforeEach, vi } from 'vitest'

// CRM PIPELINE SCOPING (ENTITY-SPACES-BUILD §C Phase 2). The space_id threading is ADDITIVE and
// BACKWARD-COMPATIBLE. What is locked here, network-free (the admin client is mocked to record the
// filters each read applies):
//   1. REGRESSION — the GLOBAL path (no spaceId) applies NO space_id filter, so /admin/crm sees the
//      whole table exactly as today. This is the critical backward-compat guarantee.
//   2. PER-SPACE — passing a spaceId adds exactly one `.eq('space_id', <id>)` to the read, so a
//      caller for Space A reads only Space A rows (cross-space isolation).
//   3. The same holds for getStages / getDeals / getDeal / getActivities / countOpenTasks /
//      getContacts / getContact.

// A chainable query mock that records the (col, val) of every .eq() so the test can assert whether a
// space_id filter was applied. Every terminal (await, .maybeSingle, .order chain) resolves to the
// rows seeded for the table, pre-filtered by the recorded eq()s so isolation is real, not just shape.
type Row = Record<string, unknown>

const store: Record<string, Row[]> = {
  crm_stages: [],
  crm_deals: [],
  crm_activities: [],
  contacts: [],
  profiles: [],
}

// Records the eqs applied to the LAST query per table, so a test can assert "space_id was filtered".
const lastEqs: Record<string, [string, string][]> = {}

function queryFor(table: string) {
  const eqs: [string, string][] = []
  lastEqs[table] = eqs
  let isCount = false
  const matches = (): Row[] =>
    store[table]!.filter((r) => eqs.every(([col, val]) => r[col] === val))
  const api = {
    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (opts?.count) isCount = true
      return api
    },
    eq(col: string, val: string) {
      eqs.push([col, val])
      return api
    },
    is() {
      // terminal for countOpenTasks (after .is('completed_at', null)); resolve a count.
      return Promise.resolve({ count: matches().length, data: matches(), error: null })
    },
    order() {
      return api
    },
    limit() {
      return Promise.resolve({ data: matches(), error: null })
    },
    in(col: string, ids: string[]) {
      // Apply any recorded eqs (e.g. a space_id scope set before .in) AND the id membership, so an
      // id `in` read stays space-scoped just like the real query builder.
      return Promise.resolve({
        data: matches().filter((r) => ids.includes(r[col] as string)),
        error: null,
      })
    },
    maybeSingle() {
      return Promise.resolve({ data: matches()[0] ?? null, error: null })
    },
    then(resolve: (r: { data: Row[] | null; count?: number; error: null }) => unknown) {
      return Promise.resolve(
        resolve(isCount ? { data: null, count: matches().length, error: null } : { data: matches(), error: null }),
      )
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => queryFor(table) }),
}))

import {
  getStages,
  getDeals,
  getDeal,
  getActivities,
  countOpenTasks,
  getContacts,
  getContact,
  getSpaceTasks,
  partitionTasks,
  computeMetrics,
  type SpaceTask,
  type CrmDeal,
} from './pipeline'

function hasSpaceFilter(table: string): boolean {
  return (lastEqs[table] ?? []).some(([col]) => col === 'space_id')
}
function spaceFilterValue(table: string): string | undefined {
  return (lastEqs[table] ?? []).find(([col]) => col === 'space_id')?.[1]
}

beforeEach(() => {
  store.crm_stages = [
    { id: 's-root', name: 'Lead', sort_order: 1, kind: 'open', space_id: 'root' },
    { id: 's-A', name: 'Lead', sort_order: 1, kind: 'open', space_id: 'space-A' },
  ]
  store.crm_deals = [
    { id: 'd-root', title: 'Root deal', stage_id: 's-root', value: 10, status: 'open', space_id: 'root', created_at: 'x', updated_at: 'x' },
    { id: 'd-A', title: 'A deal', stage_id: 's-A', value: 20, status: 'open', space_id: 'space-A', created_at: 'x', updated_at: 'x' },
  ]
  store.crm_activities = [
    { id: 'a-root', deal_id: 'd-root', kind: 'task', body: '', created_at: 'x', space_id: 'root', completed_at: null },
    { id: 'a-A', deal_id: 'd-A', kind: 'task', body: '', created_at: 'x', space_id: 'space-A', completed_at: null },
  ]
  store.contacts = [
    { id: 'c-root', email: 'r@x.com', display_name: 'Root', consent_state: 'unknown', created_at: 'x', space_id: 'root' },
    { id: 'c-A', email: 'a@x.com', display_name: 'A', consent_state: 'unknown', created_at: 'x', space_id: 'space-A' },
  ]
  store.profiles = []
  for (const k of Object.keys(lastEqs)) delete lastEqs[k]
})

describe('getStages', () => {
  it('GLOBAL (no spaceId): applies no space filter and sees all stages', async () => {
    const stages = await getStages()
    expect(hasSpaceFilter('crm_stages')).toBe(false)
    expect(stages).toHaveLength(2)
  })
  it('PER-SPACE: filters space_id and sees only that space', async () => {
    const stages = await getStages('space-A')
    expect(spaceFilterValue('crm_stages')).toBe('space-A')
    expect(stages.map((s) => s.id)).toEqual(['s-A'])
  })
})

describe('getDeals', () => {
  it('GLOBAL (no spaceId): no space filter, all deals (regression)', async () => {
    const deals = await getDeals()
    expect(hasSpaceFilter('crm_deals')).toBe(false)
    expect(deals.map((d) => d.id).sort()).toEqual(['d-A', 'd-root'])
  })
  it('PER-SPACE: Space A reads only Space A deals (isolation)', async () => {
    const deals = await getDeals('space-A')
    expect(spaceFilterValue('crm_deals')).toBe('space-A')
    expect(deals.map((d) => d.id)).toEqual(['d-A'])
  })
})

describe('getDeal', () => {
  it('GLOBAL: finds a deal by id with no space filter', async () => {
    const deal = await getDeal('d-root')
    expect(hasSpaceFilter('crm_deals')).toBe(false)
    expect(deal?.id).toBe('d-root')
  })
  it('PER-SPACE: a deal from another space is not returned', async () => {
    // Asking for the root deal id under Space A returns null (filtered by space_id).
    const deal = await getDeal('d-root', 'space-A')
    expect(spaceFilterValue('crm_deals')).toBe('space-A')
    expect(deal).toBeNull()
  })
})

describe('getActivities', () => {
  it('GLOBAL: no space filter on activities', async () => {
    await getActivities('d-root')
    expect(hasSpaceFilter('crm_activities')).toBe(false)
  })
  it('PER-SPACE: filters space_id', async () => {
    await getActivities('d-A', 'space-A')
    expect(spaceFilterValue('crm_activities')).toBe('space-A')
  })
})

describe('countOpenTasks', () => {
  it('GLOBAL: no space filter, counts all open tasks', async () => {
    const n = await countOpenTasks()
    expect(hasSpaceFilter('crm_activities')).toBe(false)
    expect(n).toBe(2)
  })
  it('PER-SPACE: counts only that space', async () => {
    const n = await countOpenTasks('space-A')
    expect(spaceFilterValue('crm_activities')).toBe('space-A')
    expect(n).toBe(1)
  })
})

describe('getContacts / getContact', () => {
  it('GLOBAL getContacts: no space filter, all contacts', async () => {
    const contacts = await getContacts()
    expect(hasSpaceFilter('contacts')).toBe(false)
    expect(contacts).toHaveLength(2)
  })
  it('PER-SPACE getContacts: only that space', async () => {
    const contacts = await getContacts('space-A')
    expect(spaceFilterValue('contacts')).toBe('space-A')
    expect(contacts.map((c) => c.id)).toEqual(['c-A'])
  })
  it('PER-SPACE getContact: a contact from another space is not returned', async () => {
    const contact = await getContact('c-root', 'space-A')
    expect(spaceFilterValue('contacts')).toBe('space-A')
    expect(contact).toBeNull()
  })
})

describe('getSpaceTasks', () => {
  it('reads only kind=task rows for the Space, scoped by space_id', async () => {
    // Seed a task + a non-task activity in Space A, plus a root task that must NOT leak.
    store.crm_activities = [
      { id: 't-A', deal_id: null, contact_id: null, kind: 'task', body: 'Call A', due_at: null, completed_at: null, created_at: 'x', space_id: 'space-A' },
      { id: 'n-A', deal_id: null, contact_id: null, kind: 'note', body: 'a note', due_at: null, completed_at: null, created_at: 'x', space_id: 'space-A' },
      { id: 't-root', deal_id: null, contact_id: null, kind: 'task', body: 'Root task', due_at: null, completed_at: null, created_at: 'x', space_id: 'root' },
    ]
    const tasks = await getSpaceTasks('space-A')
    expect(spaceFilterValue('crm_activities')).toBe('space-A')
    expect(tasks.map((t) => t.id)).toEqual(['t-A'])
    expect(tasks[0]!.title).toBe('Call A')
  })

  it('resolves a deal link label, space-scoped', async () => {
    store.crm_activities = [
      { id: 't-A', deal_id: 'd-A', contact_id: null, kind: 'task', body: 'Follow up', due_at: null, completed_at: null, created_at: 'x', space_id: 'space-A' },
    ]
    const tasks = await getSpaceTasks('space-A')
    expect(tasks[0]!.linkLabel).toBe('A deal')
  })

  it('FAIL-SAFE: returns [] for an empty spaceId', async () => {
    expect(await getSpaceTasks('')).toEqual([])
  })
})

describe('computeMetrics (pure, lane-aware)', () => {
  type MDeal = Pick<CrmDeal, 'status' | 'value' | 'source' | 'closed_at'>
  const now = new Date('2026-07-15T00:00:00.000Z')
  function deal(over: Partial<MDeal>): MDeal {
    return { status: 'open', value: 0, source: null, closed_at: null, ...over }
  }

  it('keeps the legacy fields intact (openCount / openValue / wonValue / winRate)', () => {
    const m = computeMetrics(
      [
        deal({ status: 'open', value: 100 }),
        deal({ status: 'won', value: 50 }),
        deal({ status: 'lost' }),
      ],
      3,
      now,
    )
    expect(m.openCount).toBe(1)
    expect(m.openValue).toBe(100)
    expect(m.wonValue).toBe(50)
    expect(m.winRatePct).toBe(50) // 1 won of 2 decided
    expect(m.tasksDue).toBe(3)
  })

  it('splits open deals by lane (source)', () => {
    const m = computeMetrics(
      [
        deal({ status: 'open', source: 'upsell_business' }),
        deal({ status: 'open', source: 'upsell_business' }),
        deal({ status: 'open', source: 'donation' }),
        deal({ status: 'open', source: 'referral' }), // untagged, counts in openCount only
      ],
      0,
      now,
    )
    expect(m.openCount).toBe(4)
    expect(m.businessOpen).toBe(2)
    expect(m.donationOpen).toBe(1)
  })

  it('counts upgrades only for upsell wins closed THIS month, and recurring donors for all donation wins', () => {
    const m = computeMetrics(
      [
        deal({ status: 'won', source: 'upsell_business', closed_at: '2026-07-03T12:00:00.000Z' }), // this month
        deal({ status: 'won', source: 'upsell_business', closed_at: '2026-06-30T12:00:00.000Z' }), // last month
        deal({ status: 'won', source: 'upsell_business', closed_at: null }), // no close date -> not counted
        deal({ status: 'won', source: 'donation', closed_at: '2026-01-01T00:00:00.000Z' }),
        deal({ status: 'won', source: 'donation', closed_at: null }),
      ],
      0,
      now,
    )
    expect(m.upgradesThisMonth).toBe(1)
    expect(m.recurringDonors).toBe(2)
  })
})

describe('partitionTasks (pure)', () => {
  function task(over: Partial<SpaceTask>): SpaceTask {
    return {
      id: 'id',
      title: 't',
      due_at: null,
      completed_at: null,
      deal_id: null,
      contact_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
      linkLabel: null,
      ...over,
    }
  }

  it('splits open vs done by completed_at', () => {
    const { open, done } = partitionTasks([
      task({ id: 'a' }),
      task({ id: 'b', completed_at: '2026-02-01T00:00:00.000Z' }),
    ])
    expect(open.map((t) => t.id)).toEqual(['a'])
    expect(done.map((t) => t.id)).toEqual(['b'])
  })

  it('orders open tasks soonest-due first, then undated last', () => {
    const { open } = partitionTasks([
      task({ id: 'undated', due_at: null }),
      task({ id: 'late', due_at: '2026-06-30T00:00:00.000Z' }),
      task({ id: 'soon', due_at: '2026-06-24T00:00:00.000Z' }),
    ])
    expect(open.map((t) => t.id)).toEqual(['soon', 'late', 'undated'])
  })

  it('orders done tasks most-recently-completed first', () => {
    const { done } = partitionTasks([
      task({ id: 'older', completed_at: '2026-01-01T00:00:00.000Z' }),
      task({ id: 'newer', completed_at: '2026-03-01T00:00:00.000Z' }),
    ])
    expect(done.map((t) => t.id)).toEqual(['newer', 'older'])
  })

  it('is deterministic on equal timestamps (stable id tiebreak)', () => {
    const { open } = partitionTasks([
      task({ id: 'b', due_at: '2026-06-24T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z' }),
      task({ id: 'a', due_at: '2026-06-24T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z' }),
    ])
    expect(open.map((t) => t.id)).toEqual(['a', 'b'])
  })
})
