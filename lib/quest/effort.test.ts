import { describe, it, expect } from 'vitest'
import {
  scoreEffort,
  buildEffortBoard,
  median,
  weekBucket,
  MIN_BOARD_CONTRIBUTORS,
  EFFORT_INDEX_CAP,
  type EffortCandidate,
  type EffortEntry,
} from './effort'

// "Effort relative to yourself" (the owner's ruling for the Circle board). These fail on the
// pre-change tree for the plainest possible reason: there was no self-relative scoring anywhere in
// the repo — the only board was /crew/leaderboard, which orders members by an ABSOLUTE season Zap
// total, the exact 1-to-N ranking the ruling rejects.
//
// The clock is injected everywhere, so nothing here depends on the day it runs.

const NOW = Date.parse('2026-08-12T12:00:00.000Z')
const DAY = 86_400_000

/** A ledger row `n` days before NOW. */
function ago(days: number, amount: number): EffortEntry {
  return { at: new Date(NOW - days * DAY).toISOString(), amount }
}

/** A member with the same amount every week for the four baseline weeks, plus `recent` this week. */
function steadyHistory(weekly: number, recent: number): EffortEntry[] {
  return [ago(1, recent), ago(8, weekly), ago(15, weekly), ago(22, weekly), ago(29, weekly)]
}

describe('median', () => {
  it('takes the middle of an odd list and averages the middle pair of an even one', () => {
    expect(median([30, 10, 20])).toBe(20)
    expect(median([10, 20, 30, 40])).toBe(25)
  })

  it('is unmoved by ONE outlier week, which is why a finished Journey does not poison a baseline', () => {
    // Finishing a Journey pays +75 Zaps in a single week (ADR-305). On a mean that week would lift
    // the denominator from 20 to 40 and make every following week read as a decline.
    expect(median([20, 20, 20, 95])).toBe(20)
  })

  it('returns 0 for an empty list rather than NaN', () => {
    expect(median([])).toBe(0)
  })
})

describe('weekBucket', () => {
  it('puts the last 7 days in bucket 0 and each earlier week in its own', () => {
    expect(weekBucket(NOW, new Date(NOW).toISOString())).toBe(0)
    expect(weekBucket(NOW, new Date(NOW - 6.9 * DAY).toISOString())).toBe(0)
    expect(weekBucket(NOW, new Date(NOW - 7 * DAY).toISOString())).toBe(1)
    expect(weekBucket(NOW, new Date(NOW - 34 * DAY).toISOString())).toBe(4)
  })

  it('drops anything older than the 35-day window, and any unparseable stamp', () => {
    expect(weekBucket(NOW, new Date(NOW - 35 * DAY).toISOString())).toBe(-1)
    expect(weekBucket(NOW, 'not a date')).toBe(-1)
  })

  it('counts a future stamp as this week, so clock skew never deletes someone effort', () => {
    expect(weekBucket(NOW, new Date(NOW + DAY).toISOString())).toBe(0)
  })
})

describe('scoreEffort — the ratio', () => {
  const veteran = { accountAgeDays: 400, now: NOW }

  it('reads a matching week as steady, at 100 percent of their own usual week', () => {
    const s = scoreEffort({ entries: steadyHistory(100, 100), ...veteran })
    expect(s.baseline).toBe(100)
    expect(s.index).toBe(100)
    expect(s.band).toBe('steady')
  })

  it('reads a bigger week as climbing', () => {
    const s = scoreEffort({ entries: steadyHistory(100, 160), ...veteran })
    expect(s.index).toBe(160)
    expect(s.band).toBe('climbing')
  })

  it('reads a smaller week as easing, and never as a deficit or a position', () => {
    const s = scoreEffort({ entries: steadyHistory(100, 40), ...veteran })
    expect(s.index).toBe(40)
    expect(s.band).toBe('easing')
    // There is nothing in the score that can express "behind" or "last".
    expect(Object.keys(s).sort()).toEqual(['band', 'baseline', 'daysThisWeek', 'index', 'recent'])
  })

  it('scores a BEGINNER and a VETERAN identically when both doubled their own usual week', () => {
    // The whole ruling in one assertion: 8 Zaps against a usual 4, and 800 against a usual 400,
    // are the same week. On the crew board they are 100 places apart.
    const beginner = scoreEffort({ entries: steadyHistory(4, 8), ...veteran })
    const vet = scoreEffort({ entries: steadyHistory(400, 800), ...veteran })
    expect(beginner.index).toBe(vet.index)
    expect(beginner.band).toBe(vet.band)
    expect(beginner.band).toBe('climbing')
  })

  it('caps the index, so there is nothing to win by grinding', () => {
    const s = scoreEffort({ entries: steadyHistory(5, 5_000), ...veteran })
    expect(s.index).toBe(EFFORT_INDEX_CAP)
  })

  it('ignores ledger corrections, so a clawback cannot read as a lighter week', () => {
    const s = scoreEffort({ entries: [...steadyHistory(100, 100), ago(1, -80), ago(2, 0)], ...veteran })
    expect(s.recent).toBe(100)
    expect(s.index).toBe(100)
  })

  it('ignores activity older than the window', () => {
    const s = scoreEffort({ entries: [...steadyHistory(100, 100), ago(90, 9_999)], ...veteran })
    expect(s.baseline).toBe(100)
  })

  it('counts distinct days shown up this week, not ledger rows', () => {
    const entries = [ago(1, 10), ago(1, 10), ago(3, 10), ago(8, 40), ago(15, 40), ago(22, 40), ago(29, 40)]
    expect(scoreEffort({ entries, ...veteran }).daysThisWeek).toBe(2)
  })
})

describe('scoreEffort — illness, travel, and the week you were away', () => {
  const veteran = { accountAgeDays: 400, now: NOW }

  it('does not let ONE quiet week drag the usual week down', () => {
    // 100, away, 100, 100 → their usual week is still 100, so a normal return reads as steady.
    const entries = [ago(1, 100), ago(8, 100), ago(22, 100), ago(29, 100)]
    const s = scoreEffort({ entries, ...veteran })
    expect(s.baseline).toBe(100)
    expect(s.band).toBe('steady')
  })

  it('routes a member back from a LONG gap to "returning", before any ratio is computed', () => {
    // Three weeks ill, then back. Only one active baseline week, so there is no comparison to make.
    const entries = [ago(1, 60), ago(29, 100)]
    const s = scoreEffort({ entries, ...veteran })
    expect(s.band).toBe('returning')
    expect(s.index).toBeNull()
    expect(s.baseline).toBeNull()
    expect(s.daysThisWeek).toBe(1)
  })

  it('never scores a returning member as easing, however light their first week back is', () => {
    const entries = [ago(1, 1), ago(29, 500)]
    expect(scoreEffort({ entries, ...veteran }).band).toBe('returning')
  })

  it('does not hand a returning member a fake 200 percent either', () => {
    // Counting the zero weeks into the median would halve the denominator and invent a spike.
    const s = scoreEffort({ entries: [ago(1, 100), ago(29, 100)], ...veteran })
    expect(s.index).toBeNull()
  })
})

describe('scoreEffort — the cold start, which is every member of a new Circle', () => {
  it('says a first-week member has NO usual week yet, rather than guessing one', () => {
    const s = scoreEffort({ entries: [ago(1, 30), ago(2, 15)], accountAgeDays: 3, now: NOW })
    expect(s.band).toBe('new')
    expect(s.index).toBeNull()
    expect(s.baseline).toBeNull()
  })

  it('still gives that member a real number: the days they showed up', () => {
    const s = scoreEffort({ entries: [ago(0, 30), ago(2, 15), ago(4, 15)], accountAgeDays: 3, now: NOW })
    expect(s.daysThisWeek).toBe(3)
    expect(s.recent).toBe(60)
  })

  it('separates "no usual week yet" from "back after a break" by account age alone', () => {
    const entries = [ago(1, 30)]
    expect(scoreEffort({ entries, accountAgeDays: 10, now: NOW }).band).toBe('new')
    expect(scoreEffort({ entries, accountAgeDays: 200, now: NOW }).band).toBe('returning')
  })

  it('holds "new" until two of the four baseline weeks have activity', () => {
    // Day 20 of a member's life: one active baseline week is not enough.
    const one = scoreEffort({ entries: [ago(1, 30), ago(8, 30)], accountAgeDays: 20, now: NOW })
    expect(one.band).toBe('new')
    // A second active baseline week is, and the comparison begins.
    const two = scoreEffort({ entries: [ago(1, 30), ago(8, 30), ago(15, 30)], accountAgeDays: 20, now: NOW })
    expect(two.band).toBe('steady')
    expect(two.baseline).toBe(30)
  })

  it('gives a member with no history at all a zero week rather than throwing', () => {
    const s = scoreEffort({ entries: [], accountAgeDays: 0, now: NOW })
    expect(s).toEqual({ band: 'new', recent: 0, baseline: null, index: null, daysThisWeek: 0 })
  })
})

// ── THE BOARD ───────────────────────────────────────────────────────────────────────────────────

function candidate(name: string, opts: Partial<EffortCandidate> & { entries?: EffortEntry[] } = {}): EffortCandidate {
  return {
    id: opts.id ?? `id-${name}`,
    displayName: name,
    optedOut: opts.optedOut ?? false,
    effort: opts.effort ?? scoreEffort({ entries: opts.entries ?? steadyHistory(100, 100), accountAgeDays: 400, now: NOW }),
  }
}

/** `n` members who all showed up this week. */
function contributors(n: number): EffortCandidate[] {
  // Reverse-alphabetical on the way in, so the alphabetical assertion cannot pass by accident.
  return Array.from({ length: n }, (_, i) => candidate(`Member ${String(n - i).padStart(3, '0')}`))
}

describe('buildEffortBoard — the size gate', () => {
  it('renders NO list for a circle of one', () => {
    const board = buildEffortBoard(contributors(1))
    expect(board.showsBoard).toBe(false)
    expect(board.rows).toEqual([])
    expect(board.showing).toBe(1)
  })

  it('renders NO list for three, which is the ladder the ruling forbids', () => {
    const board = buildEffortBoard(contributors(3))
    expect(board.showsBoard).toBe(false)
    expect(board.rows).toEqual([])
    expect(board.showing).toBe(3)
  })

  it('renders the list at exactly six, the threshold', () => {
    expect(MIN_BOARD_CONTRIBUTORS).toBe(6)
    const board = buildEffortBoard(contributors(6))
    expect(board.showsBoard).toBe(true)
    expect(board.rows).toHaveLength(6)
  })

  it('renders every row at sixty, with no truncation into a top ten', () => {
    const board = buildEffortBoard(contributors(60))
    expect(board.showsBoard).toBe(true)
    expect(board.rows).toHaveLength(60)
    expect(board.showing).toBe(60)
  })

  it('counts VISIBLE people toward the gate, so hidden members cannot prop a list up', () => {
    const rows = [...contributors(5), candidate('Zed', { optedOut: true })]
    const board = buildEffortBoard(rows)
    expect(board.showing).toBe(5)
    expect(board.showsBoard).toBe(false)
  })
})

describe('buildEffortBoard — no ranking, anywhere', () => {
  it('orders alphabetically, NOT by the number, so no row is above another', () => {
    const rows = buildEffortBoard([
      candidate('Zoe', { entries: steadyHistory(100, 200) }), // 200%
      candidate('Ana', { entries: steadyHistory(100, 20) }), //  20%
      candidate('Mo', { entries: steadyHistory(100, 100) }), // 100%
      ...contributors(3),
    ]).rows
    expect(rows.map((r) => r.displayName).slice(0, 3)).toEqual(['Ana', 'Member 001', 'Member 002'])
    // The highest index is not first, and the lowest is not last.
    expect(rows[0].displayName).toBe('Ana')
    expect(rows[rows.length - 1].displayName).toBe('Zoe')
  })

  it('leaves out anyone who did not show up this week, rather than parking them at the bottom', () => {
    const away = candidate('Away', { entries: [ago(8, 100), ago(15, 100), ago(22, 100)] })
    expect(away.effort.band).toBe('easing')
    expect(away.effort.index).toBe(0)
    const board = buildEffortBoard([away, ...contributors(6)])
    expect(board.rows.some((r) => r.displayName === 'Away')).toBe(false)
    expect(board.showing).toBe(6)
  })

  it('keeps a first-week member on the board even with no baseline, on their days-shown-up', () => {
    const rookie = candidate('Rookie', {
      effort: scoreEffort({ entries: [ago(1, 10), ago(3, 10)], accountAgeDays: 4, now: NOW }),
    })
    const board = buildEffortBoard([rookie, ...contributors(5)])
    expect(board.showsBoard).toBe(true)
    const row = board.rows.find((r) => r.displayName === 'Rookie')
    expect(row?.effort.band).toBe('new')
    expect(row?.effort.index).toBeNull()
    expect(row?.effort.daysThisWeek).toBe(2)
  })

  it('hides an opted-out member from the rows', () => {
    const board = buildEffortBoard([...contributors(6), candidate('Hidden', { optedOut: true })])
    expect(board.rows.some((r) => r.displayName === 'Hidden')).toBe(false)
    expect(board.rows).toHaveLength(6)
  })
})
