import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  BELONGING_SIGNALS,
  DOING_SIGNALS,
  HALF_FLOOR,
  STANDING_SCALES,
  STANDING_SIGNALS,
  STANDING_WEIGHTS,
  careScore,
  harmonicMean,
  saturate,
  standingLevers,
  standingScore,
} from './standing'

// The earned-exposure score behind the Space directory (LIVE-262 / LIVE-263). What is locked here:
//   1. THE CARDINAL INVARIANT — no paid signal, in the score or in the file. A source-shape guard,
//      because this is the one property of the ranking that a future edit could quietly end.
//   2. Saturation + the harmonic mean behave like their originals in lib/resonance/score.ts.
//   3. RENORMALISATION means "not measured", never "measured as zero" — the distinction that stops
//      the score rewarding emptiness.
//   4. The attendance gap is declared, not weighted: there is no attendance signal at all.

const SOURCE = readFileSync(path.join(import.meta.dirname, 'standing.ts'), 'utf8')

describe('🔴 the cardinal invariant: exposure is earned, never sold', () => {
  // The words a commercial signal would arrive under. Checked against the whole module, so a future
  // edit cannot slip a plan or a price into the formula without turning this red. The module's own
  // prose talks ABOUT money (it must, to say what it excludes), so the guard reads CODE, not
  // comments. Word-bounded on purpose: an unbounded /plan/i matches "plain", and a guard that cries
  // wolf on correct code is a guard someone routes around (ADR-970).
  const PAID_TOKENS = [
    /\bplans?\b/i,
    /\btiers?\b/i,
    /\bentitlements?\b/i,
    /\bstripe\b/i,
    /\bpric(e|es|ed|ing)\b/i,
    /\bsubscriptions?\b/i,
    /\bseats?\b/i,
    /\bbilling\b/i,
    /\binvoices?\b/i,
    /\bpaid\b/i,
    /\bfounding\b/i,
    /\bpremium\b/i,
    /\bupgrades?\b/i,
    /\bcents?\b/i,
  ]

  /** The module with every comment stripped, so only executable source is searched. */
  const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('carries no plan, tier, entitlement, price, or Stripe field anywhere in its code', () => {
    const hits = PAID_TOKENS.filter((re) => re.test(code)).map((re) => re.source)
    expect(hits).toEqual([])
  })

  it('imports nothing from the pricing or billing layers, and nothing at all', () => {
    // PURE means pure: no imports whatsoever, so there is no seam a paid signal could arrive
    // through later without an obvious diff.
    expect(/^\s*import\s/m.test(SOURCE)).toBe(false)
  })

  it('declares exactly six signals, and attendance is not one of them', () => {
    expect([...STANDING_SIGNALS]).toEqual(['gatherings', 'upcoming', 'rooms', 'audience', 'commons', 'care'])
    // 🔴 LIVE-263: event attendance has NO independent record on this platform (no `checked_in`
    // column; it exists only as an engagement-ledger row written by the path that pays Zaps). It is
    // therefore not a signal at all, rather than a signal quietly weighted at zero. If someone adds
    // an attendance column and a signal to match, this line is where they come to say so.
    expect(STANDING_SIGNALS).not.toContain('attendance')
    expect(/attendance/i.test(code)).toBe(false)
  })

  it('splits the six into the two halves with no signal in both or neither', () => {
    const halves = [...DOING_SIGNALS, ...BELONGING_SIGNALS]
    expect(halves.slice().sort()).toEqual([...STANDING_SIGNALS].sort())
    expect(new Set(halves).size).toBe(STANDING_SIGNALS.length)
  })
})

describe('saturate', () => {
  it('is the resonance curve with a unit: scale reads ~0.63, 2x scale ~0.86, never 1', () => {
    expect(saturate(1)).toBeCloseTo(0.632, 3)
    expect(saturate(4, 4)).toBeCloseTo(0.632, 3)
    expect(saturate(8, 4)).toBeCloseTo(0.865, 3)
    // Asymptotic, never reaching 1: volume alone cannot buy the top of a signal.
    expect(saturate(12, 4)).toBeLessThan(1)
    expect(saturate(12, 4)).toBeGreaterThan(saturate(8, 4))
  })

  it('reads a zero, negative, or non-finite count as 0', () => {
    expect(saturate(0)).toBe(0)
    expect(saturate(-5)).toBe(0)
    expect(saturate(Number.NaN)).toBe(0)
  })

  it('the scale is what stops one follower reading as a saturated audience', () => {
    // Without STANDING_SCALES.audience, one follower would score 0.63 and the sort would degenerate
    // into "has at least one of anything" — the alphabetical problem with extra steps.
    expect(saturate(1, STANDING_SCALES.audience)).toBeLessThan(0.15)
    expect(saturate(1)).toBeGreaterThan(0.6)
  })
})

describe('harmonicMean', () => {
  it('is dragged toward the smaller input, unlike the arithmetic mean', () => {
    expect(harmonicMean(0.9, 0.15)).toBeCloseTo(0.257, 3)
    expect(harmonicMean(0.5, 0.5)).toBeCloseTo(0.5, 6)
  })

  it('is 0 when either side is 0', () => {
    expect(harmonicMean(0.9, 0)).toBe(0)
  })
})

describe('standingScore: renormalisation is about the READER, not the Space', () => {
  it('drops a signal that was NOT MEASURED and redistributes its weight', () => {
    // Only the three signals a v0 directory read can measure. The other three are absent, not zero.
    const r = standingScore({ upcoming: 2, audience: 10, commons: 8 })
    expect(r.present).toEqual(['upcoming', 'audience', 'commons'])
    expect(r.signals.gatherings).toBeNull()
    expect(r.signals.rooms).toBeNull()
    expect(r.signals.care).toBeNull()
    expect(r.doing.present).toEqual(['upcoming'])
    expect(r.belonging.present).toEqual(['audience', 'commons'])
    expect(r.score).toBeGreaterThan(0)
  })

  it('scores a signal MEASURED AS ZERO as a zero, and does not drop it', () => {
    const measuredZero = standingScore({ upcoming: 0, audience: 10, commons: 8 })
    const notMeasured = standingScore({ audience: 10, commons: 8 })
    expect(measuredZero.present).toContain('upcoming')
    expect(notMeasured.present).not.toContain('upcoming')
    // The two are genuinely different numbers. Collapsing them is the failure this guards.
    expect(measuredZero.score).not.toBeCloseTo(notMeasured.score, 3)
  })

  it('🔴 does not reward emptiness: one follower and nothing else loses to a Space doing five things', () => {
    // The degenerate reading ("zero means absent") would score the sparse Space on its single
    // present signal and float it to the top. With presence keyed to the reader, both Spaces are
    // scored on the same five signals and the busy one wins.
    const sparse = standingScore({ gatherings: 0, upcoming: 0, rooms: 0, audience: 1, commons: 0 })
    const busy = standingScore({ gatherings: 3, upcoming: 2, rooms: 1, audience: 5, commons: 10 })
    expect(busy.score).toBeGreaterThan(sparse.score)
  })

  it('never punishes a Space for a signal NOBODY has yet: adding an unmeasured signal changes nothing', () => {
    // This is the whole reason attendance can be left out of v1 without re-tuning a weight. Adding
    // `gatherings: null` (the shape of an unreadable signal) leaves the score untouched.
    const a = standingScore({ upcoming: 2, audience: 10, commons: 8 })
    const b = standingScore({ upcoming: 2, audience: 10, commons: 8, gatherings: null, rooms: null })
    expect(b.score).toBeCloseTo(a.score, 12)
  })
})

describe('standingScore: the harmonic mean punishes a one-sided Space', () => {
  it('a Space that only DOES scores below a Space that does both, at the same total', () => {
    const oneSided = standingScore({ gatherings: 8, upcoming: 4, rooms: 4, audience: 0, commons: 0, care: 0 })
    const balanced = standingScore({ gatherings: 2, upcoming: 1, rooms: 1, audience: 5, commons: 4, care: 0.5 })
    expect(balanced.score).toBeGreaterThan(oneSided.score)
  })

  it('a Space that only BELONGS scores below a balanced one too (the rule is symmetric)', () => {
    const oneSided = standingScore({ gatherings: 0, upcoming: 0, rooms: 0, audience: 40, commons: 40, care: 1 })
    const balanced = standingScore({ gatherings: 2, upcoming: 1, rooms: 1, audience: 5, commons: 4, care: 0.5 })
    expect(balanced.score).toBeGreaterThan(oneSided.score)
  })

  it('the floor keeps a zero half ORDERED rather than collapsing every quiet Space to 0', () => {
    // Without HALF_FLOOR the harmonic mean would return a hard 0 for all three of these, and the
    // directory would fall back to alphabetical for the majority of Spaces. That is the bug the
    // floor exists to prevent, so the ordering below is the assertion that matters.
    const quiet = standingScore({ gatherings: 0, upcoming: 0, rooms: 0, audience: 0, commons: 0, care: 0.2 })
    const quieter = standingScore({ gatherings: 0, upcoming: 0, rooms: 0, audience: 0, commons: 0, care: 0 })
    const quietish = standingScore({ gatherings: 0, upcoming: 0, rooms: 0, audience: 3, commons: 2, care: 0.6 })
    expect(quieter.score).toBeGreaterThan(0)
    expect(quiet.score).toBeGreaterThan(quieter.score)
    expect(quietish.score).toBeGreaterThan(quiet.score)
    expect(HALF_FLOOR).toBeGreaterThan(0)
  })

  it('uses the single half alone when only one half was measured', () => {
    const doingOnly = standingScore({ gatherings: 4, upcoming: 2, rooms: 2 })
    expect(doingOnly.belonging.value).toBeNull()
    expect(doingOnly.score).toBeCloseTo(doingOnly.doing.value ?? -1, 12)
  })

  it('is 0 when nothing at all was measured', () => {
    const none = standingScore({})
    expect(none.present).toEqual([])
    expect(none.score).toBe(0)
  })

  it('always lands in [0, 1], even on malformed input', () => {
    const wild = standingScore({
      gatherings: Number.POSITIVE_INFINITY,
      upcoming: -50,
      rooms: Number.NaN,
      audience: 1e9,
      commons: 1e9,
      care: 12,
    })
    expect(wild.score).toBeGreaterThanOrEqual(0)
    expect(wild.score).toBeLessThanOrEqual(1)
  })

  it('weights a gathering HELD above a date merely on the calendar', () => {
    expect(STANDING_WEIGHTS.gatherings).toBeGreaterThan(STANDING_WEIGHTS.upcoming)
    const held = standingScore({ gatherings: 4, upcoming: 0, rooms: 0, audience: 5, commons: 5 })
    const planned = standingScore({ gatherings: 0, upcoming: 4, rooms: 0, audience: 5, commons: 5 })
    expect(held.score).toBeGreaterThan(planned.score)
  })
})

describe('careScore', () => {
  it('is the share of the fields the reader LOOKED AT that are filled', () => {
    expect(careScore({ tagline: 'Yoga in the park', logoUrl: null })).toBeCloseTo(0.5, 6)
    expect(careScore({ tagline: 'x', logoUrl: 'u', coverUrl: 'c', subject: 'movement' })).toBe(1)
  })

  it('excludes a field the reader did not fetch, and counts a fetched-but-empty one against', () => {
    // undefined = not measured (out of the denominator). null / '' = measured and empty (counts).
    expect(careScore({ tagline: 'x' })).toBe(1)
    expect(careScore({ tagline: 'x', about: null })).toBeCloseTo(0.5, 6)
    expect(careScore({ tagline: 'x', about: '   ' })).toBeCloseTo(0.5, 6)
  })

  it('returns null when nothing was measured, so it passes straight through as an absent signal', () => {
    expect(careScore({})).toBeNull()
    expect(standingScore({ care: careScore({}) }).signals.care).toBeNull()
  })

  it('counts a list field by whether it has anything in it', () => {
    expect(careScore({ offerings: 0, socials: 3 })).toBeCloseTo(0.5, 6)
  })
})

describe('standingLevers: the operator receipt (LIVE-265)', () => {
  it('names every signal, weakest-measured first, with unmeasured ones last', () => {
    const levers = standingLevers(standingScore({ gatherings: 0, upcoming: 6, audience: 1, care: 1 }))
    expect(levers).toHaveLength(STANDING_SIGNALS.length)
    const measured = levers.filter((l) => l.value !== null)
    const unmeasured = levers.filter((l) => l.value === null)
    expect(levers.slice(measured.length)).toEqual(unmeasured)
    // Weakest first: the top of the list is the next thing worth doing.
    expect(measured[0].signal).toBe('gatherings')
    for (let i = 1; i < measured.length; i++) {
      expect(measured[i].value).toBeGreaterThanOrEqual(measured[i - 1].value ?? 0)
    }
  })

  it('bands a signal honestly: unmeasured is not the same as quiet', () => {
    const levers = standingLevers(standingScore({ gatherings: 0, audience: 20 }))
    const byKey = Object.fromEntries(levers.map((l) => [l.signal, l]))
    expect(byKey.gatherings.band).toBe('quiet')
    expect(byKey.audience.band).toBe('strong')
    expect(byKey.rooms.band).toBe('unmeasured')
  })

  it('every lever says what it measures and names one move, with no em dashes (CONTENT-VOICE §10)', () => {
    for (const lever of standingLevers(standingScore({}))) {
      expect(lever.measures.length).toBeGreaterThan(0)
      expect(lever.move.length).toBeGreaterThan(0)
      expect(`${lever.label}${lever.measures}${lever.move}`).not.toMatch(/[—–]/)
    }
  })
})
