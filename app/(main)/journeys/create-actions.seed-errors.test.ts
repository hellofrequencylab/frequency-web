import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'

// LIVE-173 — A JOURNEY CREATED WITH MISSING PHASES MUST NOT BE REPORTED AS CREATED.
//
// Four child inserts in app/(main)/journeys/create-actions.ts and insertChildren in
// lib/journeys/compose.ts were all `await admin...insert(...)` with the result unread. A Journey
// whose phases or items never landed was still redirected to as if it had been built: the author
// arrived in the editor at an empty or half-built curriculum, and nothing anywhere recorded why.
// SCAN-628 fixed this for EDITING; the create path was never carried along.
//
// These actions end in `redirect()`, so they have no return channel and the plan row itself DID
// commit — rolling back would strand a real Journey. So the consequence under test is that the
// failure becomes VISIBLE: a structured line naming the plan and which seeding step failed.

const logged: { event: string; fields: Record<string, unknown> }[] = []
/** Which insert calls should fail, by call index (0-based). */
let failInserts = new Set<number>()
let insertCalls = 0

function builder() {
  const api: Record<string, unknown> = {
    select: () => api,
    eq: () => api,
    insert() {
      const failed = failInserts.has(insertCalls++)
      const result = {
        data: failed ? null : { id: `id-${insertCalls}`, sort_order: 0 },
        error: failed ? { message: 'insert refused' } : null,
      }
      return {
        select: () => ({ maybeSingle: async () => result }),
        maybeSingle: async () => result,
        then: (res: (v: unknown) => void) => res(result),
      }
    },
    update: () => api,
    async maybeSingle() {
      return { data: null, error: null }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin() }))

/** insertChildren takes the admin handle as its FIRST ARGUMENT rather than calling the factory,
 *  so the test has to hand it one — mocking the factory alone would leave the real client in play. */
const admin = () => ({ from: () => builder() }) as unknown as Parameters<typeof insertChildren>[0]
vi.mock('@/lib/log', () => ({
  log: {
    info: () => {},
    warn: () => {},
    error: (event: string, fields: Record<string, unknown>) => logged.push({ event, fields }),
  },
}))

const { insertChildren } = await import('@/lib/journeys/compose')

beforeEach(() => {
  logged.length = 0
  insertCalls = 0
  failInserts = new Set()
})

describe('insertChildren reports a dropped composition row (LIVE-173)', () => {
  const rows = [
    { block_type: 'practice', title: 'Mind', body: '', domain_id: null, required: true },
    { block_type: 'practice', title: 'Body', body: '', domain_id: null, required: true },
    { block_type: 'practice', title: 'Spirit', body: '', domain_id: null, required: true },
  ] as Parameters<typeof insertChildren>[3]

  it('says nothing when every row lands', async () => {
    await insertChildren(admin(), 'plan-1', 'phase-1', rows)
    expect(logged).toEqual([])
    expect(insertCalls).toBe(3)
  })

  it('logs the plan, the parent and the row that was refused', async () => {
    failInserts = new Set([1])
    await insertChildren(admin(), 'plan-1', 'phase-1', rows)
    expect(logged).toHaveLength(1)
    expect(logged[0].event).toBe('journeys.compose_child_failed')
    expect(logged[0].fields).toMatchObject({
      planId: 'plan-1',
      parentId: 'phase-1',
      title: 'Body',
      error: 'insert refused',
    })
  })

  it('does NOT abort the loop, so one refused row never costs the rows that would have landed', async () => {
    // The slots are independent (four Pillars plus extra credit). Aborting would turn one refused
    // insert into three missing rows, which is worse than the defect being fixed.
    failInserts = new Set([0])
    await insertChildren(admin(), 'plan-1', 'phase-1', rows)
    expect(insertCalls).toBe(3)
    expect(logged).toHaveLength(1)
  })

  it('reports every refused row, not just the first', async () => {
    failInserts = new Set([0, 2])
    await insertChildren(admin(), 'plan-1', 'phase-1', rows)
    expect(logged.map((l) => l.fields.title)).toEqual(['Mind', 'Spirit'])
  })
})

describe('the create path reads every child insert (LIVE-173)', () => {
  // The four create-actions sites end in redirect(), which is not drivable in a unit test without
  // standing up auth, capabilities and Vera. What IS checkable — and is the actual regression risk —
  // is that no insert in that file goes back to discarding its result.
  const src = () =>
    readFileSync('app/(main)/journeys/create-actions.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('destructures an error from every insert, and reports it', () => {
    const code = src()
    const inserts = [...code.matchAll(/\.insert\(/g)]
    expect(inserts.length, 'the four seed inserts').toBeGreaterThanOrEqual(4)
    for (const m of inserts) {
      expect(
        code.slice(Math.max(0, m.index - 260), m.index),
        'every child insert must read its result',
      ).toMatch(/error/)
    }
    expect((code.match(/seedFailed\(/g) ?? []).length).toBeGreaterThanOrEqual(5)
  })

  it('keys each report by the seeding step, so a partial create says WHICH half is missing', () => {
    const code = src()
    for (const step of ['draft.phases', 'spark.week_phases', 'template.', 'master.']) {
      expect(code, `the ${step} step must name itself`).toContain(step)
    }
  })
})
