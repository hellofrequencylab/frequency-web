import { describe, it, expect, beforeEach, vi } from 'vitest'

// PER-SPACE OUTCOME METERING (Resonance Engine Phase 6 · ADR-387). What is locked here, network-free
// (the admin client is mocked over an in-memory playbook_runs store):
//   1. The PURE config + math: plan-shaped ceilings, the outcome-classifier markers, the ratio /
//      at-ceiling helpers, and the fail-safe emptyUsage shape.
//   2. The scoped READ: it counts only 'done' runs in THIS space, classifies re-activation / advocacy
//      by playbook id, and FAILS SAFE to a zeroed, never-at-ceiling usage on any error (display-only,
//      never blocks).

type RunRow = { playbook_id: string | null; status: string | null; subject_id: string | null; space_id: string; started_at: string }

const db = { runs: [] as RunRow[], throwOnRead: false }

// playbook_runs builder: .select(cols).eq('space_id', v).eq('status', v).gte('started_at', v)
function runsBuilder() {
  const filters: { space_id?: string; status?: string } = {}
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'space_id') filters.space_id = val
      if (col === 'status') filters.status = val
      return api
    },
    async gte() {
      if (db.throwOnRead) throw new Error('boom')
      const data = db.runs.filter(
        (r) => r.space_id === filters.space_id && (!filters.status || r.status === filters.status),
      )
      return { data, error: null }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'playbook_runs') return runsBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  getSpaceOutcomeUsage,
  playbookActionCeiling,
  isReactivationPlaybook,
  isAdvocacyPlaybook,
  usageRatio,
  isAtCeiling,
  emptyUsage,
} from './ai-usage'

beforeEach(() => {
  db.runs = []
  db.throwOnRead = false
})

function seedRun(playbookId: string, status: string, subjectId: string, spaceId = 'space-A') {
  db.runs.push({
    playbook_id: playbookId,
    status,
    subject_id: subjectId,
    space_id: spaceId,
    started_at: new Date().toISOString(),
  })
}

describe('plan-shaped ceilings (pure)', () => {
  it('the free wedge has a generous starter ceiling; the full-depth tiers are unlimited', () => {
    // Four-tier ladder (ADR-472): free / pro / business / nonprofit / organization. Pro carries the
    // generous 2000 volume; the full-depth tiers (Business/Nonprofit/Organization) are unlimited.
    expect(playbookActionCeiling('free')).toBe(50)
    expect(playbookActionCeiling('pro')).toBe(2000)
    expect(playbookActionCeiling('business')).toBeNull()
    expect(playbookActionCeiling('nonprofit')).toBeNull()
    expect(playbookActionCeiling('organization')).toBeNull()
    // Retired legacy labels resolve forward through asSpacePlan: practitioner -> pro (2000); the old
    // whitelabel plan folds to the full-depth Business tier (unlimited).
    expect(playbookActionCeiling('practitioner')).toBe(2000)
    expect(playbookActionCeiling('whitelabel')).toBeNull()
  })

  it('an unknown plan falls back to the free ceiling (most conservative)', () => {
    expect(playbookActionCeiling(null)).toBe(50)
    expect(playbookActionCeiling('nonsense')).toBe(50)
  })
})

describe('outcome classifiers (pure)', () => {
  it('classifies re-activation playbooks by id marker', () => {
    expect(isReactivationPlaybook('winback_lapsed')).toBe(true)
    expect(isReactivationPlaybook('streak_save')).toBe(true)
    expect(isReactivationPlaybook('dunning_72h')).toBe(true)
    expect(isReactivationPlaybook('celebrate_milestone')).toBe(false)
    expect(isReactivationPlaybook(42)).toBe(false)
  })

  it('classifies advocacy playbooks by id marker', () => {
    expect(isAdvocacyPlaybook('advocacy_referral')).toBe(true)
    expect(isAdvocacyPlaybook('warm_intro')).toBe(true)
    expect(isAdvocacyPlaybook('connect_nearby')).toBe(true)
    expect(isAdvocacyPlaybook('streak_save')).toBe(false)
  })
})

describe('ratio / at-ceiling math (pure)', () => {
  it('an unlimited (null) or zero ceiling is never at-ceiling', () => {
    expect(usageRatio(100, null)).toBe(0)
    expect(isAtCeiling(100, null)).toBe(false)
    expect(usageRatio(100, 0)).toBe(0)
    expect(isAtCeiling(100, 0)).toBe(false)
  })

  it('a finite ceiling computes the ratio and trips at the boundary', () => {
    expect(usageRatio(25, 50)).toBe(0.5)
    expect(isAtCeiling(49, 50)).toBe(false)
    expect(isAtCeiling(50, 50)).toBe(true)
    expect(isAtCeiling(60, 50)).toBe(true)
  })

  it('emptyUsage is zeroed, never at-ceiling, and carries the plan ceiling', () => {
    expect(emptyUsage('free')).toEqual({
      playbookActions: 0,
      membersReactivated: 0,
      advocacyAccepted: 0,
      ceiling: 50,
      ratio: 0,
      atCeiling: false,
      degraded: false,
    })
    expect(emptyUsage('free', true).degraded).toBe(true)
  })
})

describe('getSpaceOutcomeUsage (scoped, fail-safe)', () => {
  it('counts only done runs in THIS space and classifies the outcomes', async () => {
    seedRun('streak_save', 'done', 'm1')
    seedRun('winback_lapsed', 'done', 'm2')
    seedRun('advocacy_referral', 'done', 'm3')
    seedRun('celebrate', 'done', 'm4')
    seedRun('streak_save', 'dismissed', 'm5') // not done -> not counted
    seedRun('winback_lapsed', 'done', 'b1', 'space-B') // other space -> not counted

    const usage = await getSpaceOutcomeUsage('space-A', 'free')
    expect(usage.playbookActions).toBe(4)
    expect(usage.membersReactivated).toBe(2) // streak_save + winback_lapsed
    expect(usage.advocacyAccepted).toBe(1)
    expect(usage.degraded).toBe(false)
  })

  it('dedupes re-activated members by subject across multiple runs', async () => {
    seedRun('streak_save', 'done', 'm1')
    seedRun('winback_lapsed', 'done', 'm1') // same member, second run
    const usage = await getSpaceOutcomeUsage('space-A', 'free')
    expect(usage.playbookActions).toBe(2)
    expect(usage.membersReactivated).toBe(1)
  })

  it('trips atCeiling once the soft volume ceiling is reached (the upsell trigger)', async () => {
    for (let i = 0; i < 50; i++) seedRun('streak_save', 'done', `m${i}`)
    const usage = await getSpaceOutcomeUsage('space-A', 'free')
    expect(usage.playbookActions).toBe(50)
    expect(usage.atCeiling).toBe(true)
  })

  it('FAIL-SAFE: a read error yields a zeroed, never-at-ceiling, degraded usage', async () => {
    db.throwOnRead = true
    for (let i = 0; i < 100; i++) seedRun('streak_save', 'done', `m${i}`)
    const usage = await getSpaceOutcomeUsage('space-A', 'free')
    expect(usage.playbookActions).toBe(0)
    expect(usage.atCeiling).toBe(false)
    expect(usage.degraded).toBe(true)
  })

  it('a blank spaceId fails safe (never an unscoped read)', async () => {
    const usage = await getSpaceOutcomeUsage('', 'free')
    expect(usage.degraded).toBe(true)
    expect(usage.playbookActions).toBe(0)
  })
})
