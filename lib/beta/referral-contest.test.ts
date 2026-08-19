import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  rankContestRows,
  CIRCLE_STARTER_THRESHOLD,
  CIRCLE_STARTER_ZAPS,
  type ContestLeaderboardRow,
} from './referral-contest'
import { ZAP_AMOUNTS } from '@/lib/zaps'

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
  // The podium prize (WINNER_PRIZE_MONTHS) and the Founding-Member perk
  // (FOUNDING_PERK_MIN_REFERRALS) were deleted with the promises themselves (owner
  // ruling, 2026-08-12): no code grants free membership and no code writes reward_kind
  // 'founding_perk', so no surface may state either. What is left below is what the LIVE
  // copy on app/(main)/referral reads, and every one of these numbers is paid for real.
  it('holds the milestone thresholds and payouts the copy promises', () => {
    expect(CIRCLE_STARTER_THRESHOLD).toBe(10)
    expect(CIRCLE_STARTER_ZAPS).toBe(150)
    expect(ZAP_AMOUNTS.referral_activated).toBe(25)
  })
})

// ── NO UNBACKED PROMISE SURVIVES ANYWHERE A MEMBER CAN READ IT ─────────────────────────
//
// Owner ruling, 2026-08-12, the SECOND of the day and the same class as the first: the
// Founding-Member perk at 3 activated invites was published on /referral and in both beta
// email catalogs, and NOTHING granted it. reward_kind 'founding_perk' had exactly one
// writer, inside awardReferralWinners, which was deleted with the beta graduation path.
//
// This module's own header states the governing rule: "The rewards this module still pays
// are Zaps, on the live ledger, and they are the ONLY rewards the copy may claim." These
// assertions are that sentence, enforced.
//
// The page is now the whole surface. Two beta email catalog rows used to state the same
// rewards and were the sharper risk (seeded into Email Studio as DRAFTS an operator could
// approve and send WITHOUT touching code); the beta email arc was deleted on 2026-08-19, so
// there is no longer a copy of the offer anywhere but here. /referral is itself inert behind
// platform_flags.beta_referral_contest (FALSE in production, so the route 404s), which is why
// the guard reads the SOURCE rather than the rendering: a type check cannot see a promise in
// a string, and a flag flip would publish it.
const PAGE_SRC = readFileSync('app/(main)/referral/page.tsx', 'utf8')

/** Comments blanked. This file and the page BOTH explain why the perk came down, and a
 *  guard that fails on its own evidence is a guard nobody keeps. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')
}

const PERK_CLAIM = /founding[- ]?member perk|founding perk|foundingPerk|founding_perk/i

describe('the founding-perk promise is gone from every surface that states rewards', () => {
  it('app/(main)/referral states no Founding-Member perk', () => {
    const code = stripComments(PAGE_SRC)
    expect(PERK_CLAIM.test(code), `/referral still claims a founding perk:\n${code.match(PERK_CLAIM)?.[0]}`).toBe(false)
    // The constant behind the deleted progress bar is gone from the module's exports too,
    // so nothing can quietly re-render it.
    expect(PAGE_SRC).not.toContain('FOUNDING_PERK_MIN_REFERRALS')
  })

  it('the page claims exactly the two payouts the code makes, by reading their constants', () => {
    const code = stripComments(PAGE_SRC)
    expect(code).toContain('ZAP_AMOUNTS.referral_activated')
    expect(code).toContain('CIRCLE_STARTER_ZAPS')
    // Hardcoded Zap totals would drift from the ledger the moment either is tuned.
    expect(code).not.toMatch(/\b(25|150) Zaps\b/)
  })

  // Was a three-file sweep. The other two (lib/beta/email-templates.ts,
  // lib/beta/launch-emails.ts) were the beta email catalog and are deleted, so the surviving
  // module is the whole corpus: this is the ONE place a reward can be named in code now.
  it('no reward this module cannot pay is named anywhere in it', () => {
    const file = 'lib/beta/referral-contest.ts'
    const code = stripComments(readFileSync(file, 'utf8'))
    expect(PERK_CLAIM.test(code), `${file} still names the founding perk`).toBe(false)
  })
})
