import { describe, it, expect, beforeEach, vi } from 'vitest'

// Phase 4 per-Pillar Zap attribution (ADR-1131). Proves the module's one hard contract —
// CONSERVATION: the split divides a log's Zaps across Pillars and never changes the total
// (Σ byPillar + unattributed === wallet total, exactly, in integers) — plus the freeze
// semantics: a log-time snapshot always wins over the practice's current split, and only
// pre-freeze rows (null snapshot) fall back to it.

import {
  normalizePrimaryPct,
  splitZaps,
  attributeLogs,
  getMemberPillarZaps,
  PRIMARY_PCT_DEFAULT,
  type PillarSplit,
  type AttributedLogRow,
} from './attribution'

const MIND = 'pillar-mind'
const BODY = 'pillar-body'

const split = (over: Partial<PillarSplit> = {}): PillarSplit => ({
  pillarId: MIND,
  secondaryPillarId: BODY,
  primaryPct: 75,
  ...over,
})

describe('normalizePrimaryPct', () => {
  it('is 100 with no secondary (single-Pillar)', () => {
    expect(normalizePrimaryPct(split({ secondaryPillarId: null }))).toBe(100)
  })
  it('is 100 when the secondary degenerates to the primary', () => {
    expect(normalizePrimaryPct(split({ secondaryPillarId: MIND }))).toBe(100)
  })
  it('defaults to 75 when pct is null or junk', () => {
    expect(normalizePrimaryPct(split({ primaryPct: null }))).toBe(PRIMARY_PCT_DEFAULT)
    expect(normalizePrimaryPct(split({ primaryPct: Number.NaN }))).toBe(PRIMARY_PCT_DEFAULT)
  })
  it('clamps into [50, 100] (the ADR-438 dominance floor)', () => {
    expect(normalizePrimaryPct(split({ primaryPct: 10 }))).toBe(50)
    expect(normalizePrimaryPct(split({ primaryPct: 250 }))).toBe(100)
    expect(normalizePrimaryPct(split({ primaryPct: 60 }))).toBe(60)
  })
})

describe('splitZaps', () => {
  it('matches the documented example: 12 Zaps at 75/25 → 9 primary, 3 secondary', () => {
    expect(splitZaps(12, split())).toEqual({ primary: 9, secondary: 3 })
  })
  it('CONSERVES exactly for every total × pct (never mints or burns a Zap)', () => {
    for (let total = 0; total <= 30; total++) {
      for (let pct = 50; pct <= 100; pct++) {
        const { primary, secondary } = splitZaps(total, split({ primaryPct: pct }))
        expect(primary + secondary).toBe(total)
        expect(secondary).toBeGreaterThanOrEqual(0)
        // Floor ≥ 50 ⇒ the primary stays dominant, odd totals included (15 @ 50 → 8/7).
        expect(primary).toBeGreaterThanOrEqual(secondary)
      }
    }
  })
  it('rides the remainder with the primary at 50/50 on odd totals', () => {
    expect(splitZaps(15, split({ primaryPct: 50 }))).toEqual({ primary: 8, secondary: 7 })
  })
  it('is total-function safe on junk input', () => {
    expect(splitZaps(-5, split())).toEqual({ primary: 0, secondary: 0 })
    expect(splitZaps(Number.NaN, split())).toEqual({ primary: 0, secondary: 0 })
  })
})

describe('attributeLogs', () => {
  const row = (over: Partial<AttributedLogRow> = {}): AttributedLogRow => ({
    practiceId: 'p1',
    zaps: 12,
    snapshot: split(),
    ...over,
  })

  it('attributes by the FROZEN snapshot even when the current split disagrees', () => {
    // The practice was re-balanced to 100% Body after the log; the ledger must not move.
    const fallback = new Map([['p1', split({ pillarId: BODY, secondaryPillarId: null })]])
    const out = attributeLogs([row()], fallback)
    expect(out.byPillar).toEqual({ [MIND]: 9, [BODY]: 3 })
    expect(out.total).toBe(12)
  })

  it('falls back to the current split only for pre-freeze rows (null snapshot)', () => {
    const fallback = new Map([['p1', split({ primaryPct: 50 })]])
    const out = attributeLogs([row({ snapshot: null })], fallback)
    expect(out.byPillar).toEqual({ [MIND]: 6, [BODY]: 6 })
    expect(out.unattributed).toBe(0)
  })

  it('routes unresolvable logs to unattributed, still conserving the total', () => {
    const out = attributeLogs(
      [
        row(), // frozen 9/3
        row({ snapshot: null, practiceId: 'gone' }), // deleted practice, no snapshot
        row({ snapshot: split({ pillarId: null, secondaryPillarId: null }), zaps: 8 }), // no-Pillar practice
        row({ zaps: null }), // unpaid → ignored
      ],
      new Map(),
    )
    expect(out.byPillar).toEqual({ [MIND]: 9, [BODY]: 3 })
    expect(out.unattributed).toBe(12 + 8)
    const attributed = Object.values(out.byPillar).reduce((a, b) => a + b, 0)
    expect(attributed + out.unattributed).toBe(out.total)
    expect(out.total).toBe(32)
  })
})

// ── getMemberPillarZaps choreography over an in-memory admin client (the repo's fake-builder
//    pattern, see lineage.test.ts): frozen rows never touch practices; only pre-freeze rows
//    trigger the fallback fetch, scoped to exactly the practices they name. ─────────────────

const store: { logs: Record<string, unknown>[]; practices: Record<string, unknown>[] } = {
  logs: [],
  practices: [],
}
const practicesQueried: string[][] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const rows = table === 'practice_logs' ? store.logs : store.practices
      const builder = {
        select: () => builder,
        eq: (_c: string, _v: unknown) => builder,
        gt: (_c: string, _v: number) => Promise.resolve({ data: rows, error: null }),
        in: (_c: string, ids: string[]) => {
          practicesQueried.push(ids)
          return Promise.resolve({
            data: rows.filter((r) => ids.includes(r.id as string)),
            error: null,
          })
        },
      }
      return builder
    },
  }),
}))

describe('getMemberPillarZaps', () => {
  beforeEach(() => {
    store.logs = []
    store.practices = []
    practicesQueried.length = 0
  })

  it('reads frozen rows without consulting practices, and merges the fallback for legacy rows', async () => {
    store.logs = [
      // Frozen at 75/25 Mind/Body.
      { practice_id: 'p1', zaps_awarded: 12, pillar_id: MIND, secondary_pillar_id: BODY, primary_pct: 75 },
      // Pre-freeze row → current split (100% Body) attributes it.
      { practice_id: 'p2', zaps_awarded: 8, pillar_id: null, secondary_pillar_id: null, primary_pct: null },
    ]
    store.practices = [
      { id: 'p2', domain_id: BODY, secondary_domain_id: null, primary_pct: 75 },
    ]
    const out = await getMemberPillarZaps('profile-1')
    expect(out.byPillar).toEqual({ [MIND]: 9, [BODY]: 3 + 8 })
    expect(out.unattributed).toBe(0)
    expect(out.total).toBe(20)
    expect(practicesQueried).toEqual([['p2']]) // only the pre-freeze practice, once
  })

  it('skips the practices fetch entirely when every row is frozen', async () => {
    store.logs = [
      { practice_id: 'p1', zaps_awarded: 15, pillar_id: MIND, secondary_pillar_id: null, primary_pct: 100 },
    ]
    const out = await getMemberPillarZaps('profile-1')
    expect(out.byPillar).toEqual({ [MIND]: 15 })
    expect(practicesQueried).toEqual([])
  })
})
