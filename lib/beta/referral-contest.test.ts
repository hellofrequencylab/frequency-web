import { describe, it, expect } from 'vitest'
import {
  rankContestRows,
  CIRCLE_STARTER_THRESHOLD,
  FOUNDING_PERK_MIN_REFERRALS,
  type ContestLeaderboardRow,
} from './referral-contest'

const row = (
  handle: string,
  activatedReferrals: number,
  circleStarts: number,
): Omit<ContestLeaderboardRow, 'rank'> => ({
  profileId: handle,
  displayName: handle,
  handle,
  avatarUrl: null,
  activatedReferrals,
  circleStarts,
  score: activatedReferrals + circleStarts,
})

describe('rankContestRows', () => {
  it('orders by score, then activated referrals, then handle; assigns 1-based rank', () => {
    const ranked = rankContestRows([
      row('bea', 2, 1), // score 3
      row('ari', 5, 0), // score 5 → 1st
      row('cy', 1, 2), // score 3, ties bea on score; fewer referrals → after bea
      row('dan', 3, 0), // score 3, ties bea/cy on score; 3 referrals > 2 → ahead of bea
    ])
    expect(ranked.map((r) => r.handle)).toEqual(['ari', 'dan', 'bea', 'cy'])
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4])
  })

  it('breaks a full tie deterministically by handle', () => {
    const ranked = rankContestRows([row('zoe', 2, 0), row('amy', 2, 0)])
    expect(ranked.map((r) => r.handle)).toEqual(['amy', 'zoe'])
  })

  it('does not mutate the input array', () => {
    const input = [row('a', 1, 0), row('b', 2, 0)]
    rankContestRows(input)
    expect(input.map((r) => r.handle)).toEqual(['a', 'b'])
  })
})

describe('contest constants', () => {
  // The podium prize (WINNER_PRIZE_MONTHS) and its assertions were deleted with the
  // promise itself (owner ruling, 2026-08-12): no code grants free membership, so no
  // surface may state it. What is left below are the two thresholds the LIVE copy on
  // app/(main)/referral still reads.
  it('holds the milestone + founding-perk thresholds the copy promises', () => {
    expect(CIRCLE_STARTER_THRESHOLD).toBe(10)
    expect(FOUNDING_PERK_MIN_REFERRALS).toBe(3)
  })
})
