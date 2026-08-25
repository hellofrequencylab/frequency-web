import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── Wiring guard: the one-tap streak nudge reaches the leaderboard (ADR-386 · LIVE-062 batch 5) ──
// `nudgeStreakMate` (streak-actions.ts) and the pure selector `circleMatesToNudge` shipped with
// Resonance Engine Phase 5 and sat consumer-less: the backend of a recorded design with no UI half.
// Source-shape, per the house archetype (components/spaces/staff-preview-banner.test.ts): unwiring
// this is silent — the leaderboard still renders, the nudge row just disappears — so no runtime
// test would fail.

const widget = readFileSync('components/widgets/leaderboard/leaderboard-consistency.tsx', 'utf8')
const button = readFileSync('components/widgets/leaderboard/nudge-mate-button.tsx', 'utf8')
const actions = readFileSync('app/(main)/crew/leaderboard/streak-actions.ts', 'utf8')

describe('the Consistency module carries the mates-at-risk row', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(widget.length).toBeGreaterThan(1000)
    expect(button.length).toBeGreaterThan(1000)
  })

  it('selects who to nudge through the pure helper, excluding the viewer', () => {
    expect(widget).toContain("from '@/lib/circles/social-fuel'")
    expect(widget).toContain('circleMatesToNudge(states, profileId)')
  })

  it('derives each mate through the real streak rules, so at-risk honors their day and rest', () => {
    // THE RULES ARE THE ASSERTION, NOT THE CALL SHAPE. This used to pin `getPracticeStreak(id)` and
    // `atRisk: s.atRisk` — the per-mate reader called once per mate. SCAN-304 replaced that fan-out
    // (twelve mates cost ~36 round trips) with two batched reads plus an in-memory derivation, and
    // the whole point of that refactor is that it CALLS the same pure rules rather than restating
    // them. So the pin follows the rules: the mate's own local day, the frozen-day bridge, the
    // streak walk, and the rest window must each come from lib/, not from a hand-rolled comparison
    // in this widget. Re-implement any one of them here and this goes red.
    expect(widget).toContain("from '@/lib/practice-streak'")
    expect(widget).toContain("from '@/lib/member-day'")
    expect(widget).toContain('memberDay(prof?.home_timezone ?? null, now)') // THEIR day, not the server's
    expect(widget).toContain('frozenDaysFrom(meta, today)')                // their reserve
    expect(widget).toContain('derivePracticeStreak(logged, frozen, today)') // the same walk
    expect(widget).toContain('isResting(rest, today)')                     // a planned rest is calm
    expect(widget).toMatch(/atRisk:\s*alive && !loggedToday && !isResting\(/)
  })

  it('cannot silently truncate a mate window into a shortened streak', () => {
    // PostgREST caps a response at max_rows (1000) and practice_logs is unique on
    // (profile_id, practice_id, logged_for) — NOT on the day — so one `.in()` across every mate is
    // not guaranteed to fit, and the rows it would drop are the oldest ones, which is exactly where
    // a streak walk ends. The batched read chunks the mates instead, so each chunk gets the whole
    // row budget. Remove the chunking and this row is the thing that notices.
    expect(widget).toContain('MATE_LOG_CHUNK')
    expect(widget).toContain('MATE_LOG_ROW_BUDGET')
    expect(widget).toMatch(/\.limit\(MATE_LOG_ROW_BUDGET\)/)
    expect(widget).toMatch(/\.order\('logged_for', \{ ascending: false \}\)/)
  })

  it('bounds the scan (each mate is a real read, and the row is capped anyway)', () => {
    expect(widget).toContain('MATE_SCAN_CAP')
  })

  it('renders one NudgeMateButton per flagged mate', () => {
    expect(widget).toContain("from './nudge-mate-button'")
    expect(widget).toContain('<NudgeMateButton mateProfileId={m.profileId}')
  })
})

describe('the nudge button calls the action and follows its contract', () => {
  it('is a client island calling nudgeStreakMate from the shared actions file', () => {
    expect(button).toContain("'use client'")
    expect(button).toContain("from '@/app/(main)/crew/leaderboard/streak-actions'")
    expect(button).toContain('await nudgeStreakMate(mateProfileId)')
  })

  it("surfaces the action's refusal string verbatim", () => {
    expect(button).toContain('setError(res.error)')
    expect(button).toContain('{error && ')
  })

  it('collapses after one tap, so one mate cannot be poked twice from one render', () => {
    expect(button).toContain('if (pending || sent) return')
    expect(button).toContain('Nudged')
  })
})

describe('the action contract the row relies on holds', () => {
  it('nudgeStreakMate is session-scoped, Circle-bound, and revalidates the leaderboard', () => {
    const body = actions.slice(actions.indexOf('export async function nudgeStreakMate'))
    expect(body).toContain('await getMyProfileId()')
    expect(body).toContain('nudgeCircleMate(profileId, mate)')
    expect(body).toContain('You can only nudge someone in one of your Circles.')
    expect(body).toContain("revalidatePath('/crew/leaderboard')")
  })
})
