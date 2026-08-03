// The risky ADR-920 write paths, under a filter-capturing fake admin client: the rollover
// reconcile (syncJourneyAdoptionRows), the journey bulk adopt's never-clobber guard, and the
// tightly-scoped "Keep it" conversion. These are the queries where one wrong .eq would retire
// another plan's rows or overwrite a member's chosen term — exactly what a pure-function test
// can't see.
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown>
const store: Record<string, Row[]> = {}
const tbl = (t: string) => (store[t] ??= [])

// A minimal PostgREST fake: filter chains collect (col, value) pairs; .or() supports the two
// shapes the sync uses; updates/upserts apply against the in-memory store.
function fakeFrom(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (c: string, v: unknown) => {
      filters.push((r) => r[c] === v)
      return chain
    },
    is: (c: string, v: unknown) => {
      filters.push((r) => r[c] == v)
      return chain
    },
    in: (c: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[c]))
      return chain
    },
    not: () => chain,
    lte: () => chain,
    or: (expr: string) => {
      // journey_plan_id.eq.X,practice_id.in.(a,b)
      const parts = expr.split(',practice_id.in.(')
      const planId = parts[0].replace('journey_plan_id.eq.', '')
      const ids = parts[1] ? parts[1].replace(')', '').split(',') : []
      filters.push((r) => r.journey_plan_id === planId || ids.includes(r.practice_id as string))
      return chain
    },
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: tbl(table).filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null }),
    update: (payload: Row) => {
      const upd: Record<string, unknown> = {
        eq: (c: string, v: unknown) => {
          filters.push((r) => r[c] === v)
          return upd
        },
        in: (c: string, vals: unknown[]) => {
          filters.push((r) => vals.includes(r[c]))
          return upd
        },
        select: () => upd,
        then: (resolve: (v: unknown) => unknown) => {
          const hit = tbl(table).filter((r) => filters.every((f) => f(r)))
          for (const r of hit) Object.assign(r, payload)
          return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(resolve)
        },
      }
      return upd
    },
    upsert: (rows: Row | Row[], opts?: { onConflict?: string }) => {
      const list = Array.isArray(rows) ? rows : [rows]
      const keys = (opts?.onConflict ?? '').split(',').map((k) => k.trim()).filter(Boolean)
      for (const row of list) {
        const existing = tbl(table).find((r) => keys.length && keys.every((k) => r[k] === row[k]))
        if (existing) Object.assign(existing, row)
        else tbl(table).push({ id: `${table}-${tbl(table).length}`, ...row })
      }
      return { then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve) }
    },
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: tbl(table).filter((r) => filters.every((f) => f(r))), error: null }).then(resolve),
  }
  return chain
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => fakeFrom(t) }) }))
vi.mock('@/lib/analytics/track', () => ({ track: vi.fn(async () => {}) }))

import { syncJourneyAdoptionRows, adoptPracticesForJourney, convertJourneyRowToSelf } from '@/lib/practices'

const PLAN = 'plan-1'
const OTHER_PLAN = 'plan-2'
const ME = 'me'

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
  tbl('profiles').push({ id: ME, home_timezone: 'UTC' })
})

function journeyRow(practiceId: string, planId = PLAN, active = true): Row {
  return {
    id: `mp-${practiceId}-${planId}`,
    profile_id: ME,
    practice_id: practiceId,
    active,
    source: 'journey',
    journey_plan_id: planId,
    term_weeks: null,
    retired_at: active ? null : '2026-08-01T00:00:00Z',
    retired_reason: active ? null : 'phase_ended',
  }
}

function selfRow(practiceId: string, termWeeks: number | null = 4): Row {
  return {
    id: `mp-self-${practiceId}`,
    profile_id: ME,
    practice_id: practiceId,
    active: true,
    source: 'self',
    journey_plan_id: null,
    term_weeks: termWeeks,
    starts_on: '2026-08-01',
    ends_on: termWeeks ? '2026-08-28' : null,
  }
}

describe('syncJourneyAdoptionRows (the rollover reconcile)', () => {
  it('retires ONLY this plan\'s stale journey rows, never another plan\'s or a self row', async () => {
    tbl('member_practices').push(journeyRow('p-old'), journeyRow('p-keep'), journeyRow('p-other', OTHER_PLAN), selfRow('p-mine'))
    await syncJourneyAdoptionRows(ME, PLAN, ['p-keep'])
    const rows = tbl('member_practices')
    expect(rows.find((r) => r.practice_id === 'p-old')!.active).toBe(false)
    expect(rows.find((r) => r.practice_id === 'p-old')!.retired_reason).toBe('phase_ended')
    expect(rows.find((r) => r.practice_id === 'p-keep')!.active).toBe(true)
    expect(rows.find((r) => r.practice_id === 'p-other')!.active).toBe(true)
    expect(rows.find((r) => r.practice_id === 'p-mine')!.active).toBe(true)
  })

  it('a SELF-held target is not "missing": no journey row is minted over it (the no-loop fix)', async () => {
    tbl('member_practices').push(selfRow('p-anchor'))
    await syncJourneyAdoptionRows(ME, PLAN, ['p-anchor'])
    const rows = tbl('member_practices').filter((r) => r.practice_id === 'p-anchor')
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('self')
    expect(rows[0].term_weeks).toBe(4)
  })

  it('a genuinely missing target is adopted as a journey row', async () => {
    await syncJourneyAdoptionRows(ME, PLAN, ['p-new'])
    const row = tbl('member_practices').find((r) => r.practice_id === 'p-new')
    expect(row).toBeTruthy()
    expect(row!.source).toBe('journey')
    expect(row!.journey_plan_id).toBe(PLAN)
    expect(row!.active).toBe(true)
  })

  it('a retired journey row re-entering the target set re-activates with retirement cleared', async () => {
    tbl('member_practices').push(journeyRow('p-back', PLAN, false))
    await syncJourneyAdoptionRows(ME, PLAN, ['p-back'])
    const row = tbl('member_practices').find((r) => r.practice_id === 'p-back')!
    expect(row.active).toBe(true)
    expect(row.retired_at).toBeNull()
    expect(row.retired_reason).toBeNull()
  })
})

describe('adoptPracticesForJourney (never-clobber)', () => {
  it('leaves an ACTIVE self row untouched (the member\'s term survives a journey enroll)', async () => {
    tbl('member_practices').push(selfRow('p-mine', 8))
    await adoptPracticesForJourney([ME], ['p-mine', 'p-fresh'], PLAN)
    const mine = tbl('member_practices').find((r) => r.practice_id === 'p-mine')!
    expect(mine.source).toBe('self')
    expect(mine.term_weeks).toBe(8)
    const fresh = tbl('member_practices').find((r) => r.practice_id === 'p-fresh')!
    expect(fresh.source).toBe('journey')
  })
})

describe('convertJourneyRowToSelf (the Keep-it guard)', () => {
  it('converts ONLY a retired journey row', async () => {
    tbl('member_practices').push(journeyRow('p-anchor', PLAN, false))
    expect(await convertJourneyRowToSelf(ME, 'p-anchor')).toBe(true)
    const row = tbl('member_practices').find((r) => r.practice_id === 'p-anchor')!
    expect(row.source).toBe('self')
    expect(row.active).toBe(true)
    expect(row.journey_plan_id).toBeNull()
  })

  it('refuses a LIVE journey row (a still-running journey keeps its row)', async () => {
    tbl('member_practices').push(journeyRow('p-live', PLAN, true))
    expect(await convertJourneyRowToSelf(ME, 'p-live')).toBe(false)
    expect(tbl('member_practices').find((r) => r.practice_id === 'p-live')!.source).toBe('journey')
  })

  it('refuses a SELF row (never wipes the member\'s own chosen term)', async () => {
    tbl('member_practices').push(selfRow('p-mine', 8))
    expect(await convertJourneyRowToSelf(ME, 'p-mine')).toBe(false)
    expect(tbl('member_practices').find((r) => r.practice_id === 'p-mine')!.term_weeks).toBe(8)
  })
})
