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

  it('reads each mate through the real streak reader, so at-risk honors their day and rest', () => {
    expect(widget).toContain('getPracticeStreak(id)')
    expect(widget).toContain('atRisk: s.atRisk')
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
