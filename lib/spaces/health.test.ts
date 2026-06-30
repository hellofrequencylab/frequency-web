import { describe, it, expect } from 'vitest'
import {
  spaceHealth,
  HEALTH_BUCKETS,
  HEALTH_BUCKET_LABEL,
  HEALTH_BUCKET_TONE,
  HEALTH_THRESHOLDS,
  type SpaceHealthSignals,
} from './health'
import type { SpaceStatus } from './types'

// PURE health classifier (no IO). What is locked here:
//   1. OPERATOR STATUS dominates: archived -> dormant, suspended -> at_risk, regardless of members.
//   2. THE MEMBER + RECENCY BOUNDARIES for a live Space: every threshold edge (dormantDays, staleDays,
//      atRiskActiveMembers, lowActiveMembers) is pinned on both sides.
//   3. DEGRADATION: an unknown signal (undefined member count, missing timestamp) never manufactures a
//      bad bucket — it is read as "unknown", not zero.
//   4. TOTALITY: every result carries a bucket AND at least one plain reason.

const NOW = Date.parse('2026-06-30T12:00:00Z')

/** Build signals at a fixed `now`, with a `lastActivityAt` `days` ago when given. */
function sig(
  over: Partial<SpaceHealthSignals> & { status?: SpaceStatus; daysAgo?: number },
): SpaceHealthSignals {
  const { daysAgo, ...rest } = over
  const lastActivityAt =
    'lastActivityAt' in over
      ? over.lastActivityAt
      : daysAgo === undefined
        ? undefined
        : new Date(NOW - daysAgo * 86_400_000).toISOString()
  return { status: 'active', now: NOW, lastActivityAt, ...rest }
}

describe('spaceHealth — operator status dominates', () => {
  it('archived -> dormant whatever the member math says', () => {
    const r = spaceHealth(sig({ status: 'archived', activeMembers: 500, daysAgo: 0 }))
    expect(r.bucket).toBe('dormant')
    expect(r.reasons[0]).toMatch(/archived/i)
  })

  it('suspended -> at_risk whatever the member math says', () => {
    const r = spaceHealth(sig({ status: 'suspended', activeMembers: 500, daysAgo: 0 }))
    expect(r.bucket).toBe('at_risk')
    expect(r.reasons[0]).toMatch(/suspended/i)
  })
})

describe('spaceHealth — dormant (live Space)', () => {
  it('zero active members with history -> dormant', () => {
    const r = spaceHealth(sig({ activeMembers: 0, totalMembers: 4, daysAgo: 2 }))
    expect(r.bucket).toBe('dormant')
    expect(r.reasons.join(' ')).toMatch(/no active members/i)
  })

  it('zero active members and zero total -> dormant with the "no members yet" reason', () => {
    const r = spaceHealth(sig({ activeMembers: 0, totalMembers: 0, daysAgo: 1 }))
    expect(r.bucket).toBe('dormant')
    expect(r.reasons.join(' ')).toMatch(/no members yet/i)
  })

  it('no activity for >= dormantDays -> dormant even with healthy member counts', () => {
    const r = spaceHealth(sig({ activeMembers: 25, totalMembers: 30, daysAgo: HEALTH_THRESHOLDS.dormantDays }))
    expect(r.bucket).toBe('dormant')
    expect(r.reasons.join(' ')).toMatch(new RegExp(`${HEALTH_THRESHOLDS.dormantDays} days`))
  })

  it('exactly dormantDays - 1 is NOT dormant (boundary), with healthy counts -> needs_attention via stale', () => {
    const r = spaceHealth(sig({ activeMembers: 25, totalMembers: 30, daysAgo: HEALTH_THRESHOLDS.dormantDays - 1 }))
    expect(r.bucket).not.toBe('dormant')
  })
})

describe('spaceHealth — at_risk (live Space)', () => {
  it('one active member with history -> at_risk', () => {
    const r = spaceHealth(sig({ activeMembers: 1, totalMembers: 5, daysAgo: 3 }))
    expect(r.bucket).toBe('at_risk')
    expect(r.reasons.join(' ')).toMatch(/down to 1 active member/i)
  })

  it('at the atRiskActiveMembers boundary (=1) with history -> at_risk', () => {
    const r = spaceHealth(sig({ activeMembers: HEALTH_THRESHOLDS.atRiskActiveMembers, totalMembers: 2, daysAgo: 0 }))
    expect(r.bucket).toBe('at_risk')
  })

  it('one active member but NO history (total unknown) is judged on recency, not at_risk', () => {
    // total unknown -> hasHistory false -> the at_risk "down to its last member" path does not fire.
    const r = spaceHealth(sig({ activeMembers: 1, daysAgo: 1 }))
    expect(r.bucket).toBe('needs_attention') // still low active members
  })
})

describe('spaceHealth — needs_attention (live Space)', () => {
  it('low active members (= lowActiveMembers boundary) -> needs_attention', () => {
    const r = spaceHealth(sig({ activeMembers: HEALTH_THRESHOLDS.lowActiveMembers, totalMembers: 10, daysAgo: 1 }))
    expect(r.bucket).toBe('needs_attention')
    expect(r.reasons.join(' ')).toMatch(/worth a look/i)
  })

  it('lowActiveMembers + 1 active with fresh activity -> healthy (just over the low boundary)', () => {
    const r = spaceHealth(sig({ activeMembers: HEALTH_THRESHOLDS.lowActiveMembers + 1, totalMembers: 10, daysAgo: 1 }))
    expect(r.bucket).toBe('healthy')
  })

  it('healthy member counts but stale activity (>= staleDays, < dormantDays) -> needs_attention', () => {
    const r = spaceHealth(sig({ activeMembers: 20, totalMembers: 25, daysAgo: HEALTH_THRESHOLDS.staleDays }))
    expect(r.bucket).toBe('needs_attention')
    expect(r.reasons.join(' ')).toMatch(/last activity/i)
  })

  it('staleDays - 1 with healthy counts is NOT stale -> healthy (boundary)', () => {
    const r = spaceHealth(sig({ activeMembers: 20, totalMembers: 25, daysAgo: HEALTH_THRESHOLDS.staleDays - 1 }))
    expect(r.bucket).toBe('healthy')
  })
})

describe('spaceHealth — healthy (live Space)', () => {
  it('plenty of active members and recent activity -> healthy', () => {
    const r = spaceHealth(sig({ activeMembers: 42, totalMembers: 50, daysAgo: 0 }))
    expect(r.bucket).toBe('healthy')
    expect(r.reasons.join(' ')).toMatch(/42 active of 50 members/i)
  })

  it('active today reason renders for daysAgo 0', () => {
    const r = spaceHealth(sig({ activeMembers: 10, totalMembers: 10, daysAgo: 0 }))
    expect(r.bucket).toBe('healthy')
    expect(r.reasons.join(' ')).toMatch(/active today/i)
  })
})

describe('spaceHealth — degraded / unknown signals', () => {
  it('all member signals unknown + recent activity -> healthy (never punished for missing data)', () => {
    const r = spaceHealth(sig({ daysAgo: 5 }))
    expect(r.bucket).toBe('healthy')
    expect(r.reasons[0]).toMatch(/active and steady/i)
  })

  it('all signals unknown (no counts, no timestamp) on an active Space -> healthy', () => {
    const r = spaceHealth({ status: 'active', now: NOW })
    expect(r.bucket).toBe('healthy')
    expect(r.reasons.length).toBeGreaterThan(0)
  })

  it('unknown counts but very old activity -> dormant on recency alone', () => {
    const r = spaceHealth(sig({ daysAgo: HEALTH_THRESHOLDS.dormantDays + 10 }))
    expect(r.bucket).toBe('dormant')
  })

  it('an unparseable timestamp is treated as unknown recency (not a crash)', () => {
    const r = spaceHealth({ status: 'active', activeMembers: 10, totalMembers: 10, lastActivityAt: 'not-a-date', now: NOW })
    expect(r.bucket).toBe('healthy')
  })
})

describe('spaceHealth — totality + copy hygiene', () => {
  const cases: SpaceHealthSignals[] = [
    { status: 'active', now: NOW },
    { status: 'active', activeMembers: 0, totalMembers: 0, now: NOW },
    { status: 'active', activeMembers: 1, totalMembers: 3, daysAgo: 0, now: NOW } as SpaceHealthSignals,
    { status: 'suspended', now: NOW },
    { status: 'archived', now: NOW },
  ]

  it('always returns a known bucket and at least one reason', () => {
    for (const c of cases) {
      const r = spaceHealth(c)
      expect(HEALTH_BUCKETS).toContain(r.bucket)
      expect(r.reasons.length).toBeGreaterThan(0)
    }
  })

  it('no reason string uses an em dash (CONTENT-VOICE hard rule)', () => {
    for (const c of cases) {
      for (const reason of spaceHealth(c).reasons) {
        expect(reason).not.toContain('—')
      }
    }
  })
})

describe('health registry exports', () => {
  it('HEALTH_BUCKETS is ordered most-urgent first', () => {
    expect(HEALTH_BUCKETS).toEqual(['at_risk', 'needs_attention', 'dormant', 'healthy'])
  })

  it('every bucket has a label and a tone', () => {
    for (const b of HEALTH_BUCKETS) {
      expect(HEALTH_BUCKET_LABEL[b]).toBeTruthy()
      expect(['success', 'warning', 'danger']).toContain(HEALTH_BUCKET_TONE[b])
    }
  })
})
