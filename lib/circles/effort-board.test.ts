import { describe, it, expect } from 'vitest'
import { summariseContributions } from './effort-board'

// THE OPT-OUT PROMISE, kept where it is made. app/(main)/crew/leaderboard/opt-out.ts says hiding
// yourself "only removes your row"; the Circle board repeats that in copy ("You still count toward
// the shared total"). This is the assertion that keeps it true: the shared total is summed from the
// CIRCLE's own activity rows, and there is no seam in that path where a member's board preference
// could be applied. Fails on the pre-change tree: there was no per-member circle contribution read
// at all, only lib/circles/earned.ts's single un-attributed number.

describe('summariseContributions', () => {
  it('totals every contribution and counts the people behind them', () => {
    expect(summariseContributions([
      { profileId: 'a', zaps: 30 },
      { profileId: 'b', zaps: 12 },
    ])).toEqual({ total: 42, contributors: 2 })
  })

  it('counts an OPTED-OUT member toward the shared total, because it never sees the preference', () => {
    // The board hides Bo's row (lib/quest/effort.ts, buildEffortBoard). The total does not care:
    // the same input produces the same total whatever Bo chose, because the choice is not an input.
    const rows = [{ profileId: 'ana', zaps: 100 }, { profileId: 'bo', zaps: 50 }]
    expect(summariseContributions(rows)).toEqual({ total: 150, contributors: 2 })
    expect(summariseContributions(rows).total).toBe(150)
  })

  it('collapses a member with several credits into one contributor', () => {
    expect(summariseContributions([
      { profileId: 'a', zaps: 10 },
      { profileId: 'a', zaps: 15 },
    ])).toEqual({ total: 25, contributors: 1 })
  })

  it('ignores zero and negative rows rather than letting a correction shrink the group total', () => {
    expect(summariseContributions([
      { profileId: 'a', zaps: 40 },
      { profileId: 'b', zaps: 0 },
      { profileId: 'c', zaps: -10 },
    ])).toEqual({ total: 40, contributors: 1 })
  })

  it('reads an empty circle as an honest zero', () => {
    expect(summariseContributions([])).toEqual({ total: 0, contributors: 0 })
  })
})
