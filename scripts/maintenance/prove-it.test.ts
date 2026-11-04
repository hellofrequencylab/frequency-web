import { describe, it, expect } from 'vitest'
import { OWNER, PROVE_IT_QUERY, WINDOW_DAYS, indeterminate, parseReading, report } from './prove-it.mjs'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PROG-R11 — the three numbers every other number in CORE-MODEL is a guess until (ADR-1510).
//
// What this suite has to prove is not the arithmetic. It is that the instrument reads each
// number from a record the game cannot touch (the host mark on the seat, never the Zap ledger),
// that the provisioned Space Circle is not counted as a circle a Space started, and that a
// payload with a hole in it is reported as "could not look" rather than as a zero. Every arm is
// driven against a real or deliberately broken payload, the discipline db-usage.test.ts applies.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The real 2026-09-21 19:57Z reading of the live project, as the SQL returned it. Kept
 *  verbatim: a fixture invented to suit the parser proves the parser suits itself. */
const LIVE = [
  {
    reading: {
      asOf: '2026-09-21T19:57:59.790864+00:00',
      windowDays: 42,
      spaces: 26,
      circles: 4,
      gatheringsHeld: 13,
      gatheringsAttested: 0,
      attendance: 0,
    },
  },
]

describe('the query reads each number from a record money and the game cannot touch', () => {
  it('reads attendance from the host mark on BOTH seat tables', () => {
    expect(PROVE_IT_QUERY).toMatch(/public\.event_rsvps r where r\.attended_at is not null/)
    expect(PROVE_IT_QUERY).toMatch(/public\.event_tickets t where t\.attended_at is not null/)
  })

  it('never reads the engagement ledger, so demoting the game cannot move the metric', () => {
    expect(PROVE_IT_QUERY).not.toMatch(/engagement_events|practice\.verified|event_attend/)
  })

  it('does not count the provisioned Space Circle as a circle the Space started', () => {
    expect(PROVE_IT_QUERY).toMatch(/not c\.is_space_primary/)
    expect(PROVE_IT_QUERY).toMatch(/c\.status in \('forming', 'active'\)/)
  })

  it('counts a gathering as held only when it was published, not cancelled, not removed, not demo, and the date passed', () => {
    for (const clause of [
      "e.status = 'published'",
      'coalesce(e.is_cancelled, false) = false',
      'e.removed_at is null',
      'not e.is_demo',
      'e.starts_at < now()',
      `make_interval(days => ${WINDOW_DAYS})`,
    ]) {
      expect(PROVE_IT_QUERY).toContain(clause)
    }
  })

  it('scores the same Space population the standing rollup does: active and not the personal root', () => {
    expect(PROVE_IT_QUERY).toMatch(/s\.status = 'active'\s+and s\.type <> 'root'/)
  })

  it('is six weeks wide, the length of the field test', () => {
    expect(WINDOW_DAYS).toBe(42)
  })
})

describe('the reading it actually took', () => {
  it('parses the live payload and states circles per Space as a ratio over the Space count', () => {
    const r = parseReading(LIVE)!
    expect(r.spaces).toBe(26)
    expect(r.circles).toBe(4)
    expect(r.circlesPerSpace).toBeCloseTo(4 / 26, 6)
    expect(r.gatheringsHeld).toBe(13)
    expect(r.gatheringsAttested).toBe(0)
    expect(r.attendance).toBe(0)
  })

  it('prints the three numbers, and a zero is printed as a zero, not omitted', () => {
    const out = report(parseReading(LIVE)!)
    expect(out.code).toBe(0)
    expect(out.text).toContain('**Circles per Space** — 0.15 (4 circles a Space started, across 26 Spaces')
    expect(out.text).toContain('**Gatherings held** — 13 in the last 42 days')
    expect(out.text).toContain('0 of them with anyone marked present')
    expect(out.text).toContain('**Attendance** — 0 people marked present by a host in the last 42 days')
    expect(out.text).toContain('2026-09-21T19:57:59.790864+00:00')
    expect(out.text).toContain(`OWNER: ${OWNER}`)
  })

  it('carries no verdict: the same code for a reading of zero and a reading of plenty', () => {
    const plenty = [{ reading: { ...LIVE[0].reading, circles: 30, gatheringsHeld: 18, gatheringsAttested: 18, attendance: 180 } }]
    expect(report(parseReading(plenty)!).code).toBe(0)
    expect(report(parseReading(LIVE)!).code).toBe(0)
    expect(report(parseReading(plenty)!).text).toContain('180 people marked present')
  })

  it('accepts the Management API envelope shapes as well as a bare array', () => {
    expect(parseReading({ result: LIVE })!.attendance).toBe(0)
    expect(parseReading({ rows: LIVE })!.spaces).toBe(26)
    expect(parseReading(JSON.stringify(LIVE))!.circles).toBe(4)
  })

  it('does not divide by zero Spaces', () => {
    const none = [{ reading: { ...LIVE[0].reading, spaces: 0, circles: 0 } }]
    const r = parseReading(none)!
    expect(r.circlesPerSpace).toBeNull()
    expect(report(r).text).toContain('no Spaces to divide by')
  })
})

describe('it refuses to say zero when it could not look', () => {
  it('returns null for an empty result, an error envelope and a bare object', () => {
    expect(parseReading([])).toBeNull()
    expect(parseReading({ message: 'Unauthorized' })).toBeNull()
    expect(parseReading({})).toBeNull()
  })

  it('returns null when any of the three numbers is missing, so a hole is never printed as a zero', () => {
    const { attendance: _drop, ...noAttendance } = LIVE[0].reading
    expect(parseReading([{ reading: noAttendance }])).toBeNull()
    // A ledger count in attendance's place is the exact substitution the row was blocked on.
    expect(parseReading([{ reading: { ...noAttendance, ledgerCheckIns: 239 } }])).toBeNull()
    const { circles: _c, ...noCircles } = LIVE[0].reading
    expect(parseReading([{ reading: noCircles }])).toBeNull()
  })

  it('exits 79 with "Could not look" and no number', () => {
    const r = indeterminate('the token expired')
    expect(r.code).toBe(79)
    expect(r.text).toContain('Could not look')
    expect(r.text).toContain('the token expired')
    expect(r.text).not.toMatch(/Circles per Space|Gatherings held|Attendance/)
  })
})
